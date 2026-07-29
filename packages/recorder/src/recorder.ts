import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApiRequestEvent,
  type ApiResponseEvent,
  type RecordingMeta,
  RecordingMetaSchema,
  type RecordingSummary,
  RecordingSummarySchema,
} from "@backbencher/schemas";
import {
  type BbConfig,
  childLogger,
  dataDir,
  loadConfig,
  newId,
  redactBodyText,
  redactHeaders,
  redactUrl,
} from "@backbencher/shared";
import { type Browser, type BrowserContext, type Page, type Request, type Response, chromium } from "playwright";
import { makeApiFilter } from "./apiFilter.js";
import { captureBody } from "./bodyCapture.js";
import { WriteQueue } from "./writeQueue.js";

export const RECORDER_VERSION = "3.0.0";

const log = childLogger({ mod: "recorder" });

export interface StartRecordingOptions {
  url: string;
  config?: BbConfig;
  headless?: boolean;
  sessionName?: string;
  goal?: string;
  authProfile?: string;
  operator?: string;
}

export interface RecorderResult {
  sessionId: string;
  sessionDir: string;
  metaPath: string;
  eventsPath: string;
  summaryPath: string;
  summary: RecordingSummary;
}

export interface RecorderHandle {
  sessionId: string;
  sessionDir: string;
  page: Page;
  context: BrowserContext;
  stop(opts?: { goal?: string }): Promise<RecorderResult>;
}

function mapResourceType(rt: string): ApiRequestEvent["resourceType"] {
  if (rt === "xhr" || rt === "fetch" || rt === "document") return rt;
  return "other";
}

const delay = (ms: number): Promise<null> =>
  new Promise((resolve) => setTimeout(() => resolve(null), ms));

export async function startRecording(opts: StartRecordingOptions): Promise<RecorderHandle> {
  const config = opts.config ?? loadConfig();
  const rec = config.recorder;
  const redaction = config.redaction;

  const sessionId = newId();
  const sessionDir = join(dataDir(), "sessions", sessionId);
  const metaPath = join(sessionDir, "meta.json");
  const eventsPath = join(sessionDir, "events.ndjson");
  const summaryPath = join(sessionDir, "summary.json");
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(eventsPath, "");

  const writeQueue = new WriteQueue(eventsPath, log);
  const apiFilter = makeApiFilter(rec.apiFilter);
  const inflight = new Map<Request, string>();

  const browser: Browser = await chromium.launch({
    headless: opts.headless ?? false,
    args: rec.tlsPermissive
      ? ["--ignore-certificate-errors", "--ignore-certificate-errors-spki-list"]
      : [],
  });

  const context: BrowserContext = await browser.newContext({
    ignoreHTTPSErrors: rec.tlsPermissive,
    serviceWorkers: rec.blockServiceWorkers ? "block" : "allow",
  });

  // ---- network capture (context-level: covers main page, popups, all frames) ----
  context.on("request", (request: Request) => {
    const method = request.method();
    const url = request.url();
    const resourceType = request.resourceType();
    if (!apiFilter.matches(method, url, resourceType)) return;

    const correlationId = newId();
    const timestamp = Date.now();
    inflight.set(request, correlationId);

    let postData: string | null = null;
    let postDataTruncated = false;
    try {
      postData = redactBodyText(request.postData() ?? null, redaction);
    } catch {
      postData = null;
    }
    if (postData !== null && Buffer.byteLength(postData, "utf8") > rec.bodyCapBytes) {
      postData = postData.slice(0, rec.bodyCapBytes);
      postDataTruncated = true;
    }

    const event: ApiRequestEvent = {
      type: "api_request",
      correlationId,
      timestamp,
      method,
      url: redactUrl(url, redaction),
      resourceType: mapResourceType(resourceType),
      headers: redactHeaders(request.headers(), redaction),
      headersSource: "sync",
      postData,
      postDataTruncated,
    };

    // Upgrade to the fuller header set if allHeaders() resolves within 5s (§3.1 bug 4).
    Promise.race([request.allHeaders(), delay(5000)])
      .then((headers) => {
        if (headers) {
          event.headers = redactHeaders(headers, redaction);
          event.headersSource = "all";
        }
        writeQueue.push(Object.freeze(event));
      })
      .catch(() => writeQueue.push(Object.freeze(event)));
  });

  context.on("response", async (response: Response) => {
    const request = response.request();
    const correlationId = inflight.get(request);
    if (!correlationId) return;
    inflight.delete(request);

    const capture = await captureBody(response, rec.bodyCapBytes, redaction);

    // Upgrade to the fuller header set via allHeaders() (raw HTTP headers, incl. ones
    // CORS-safelisting hides from headers()), mirroring the request-side upgrade above.
    let headers = redactHeaders(response.headers(), redaction);
    let headersSource: "sync" | "all" = "sync";
    try {
      const allHeaders = await Promise.race([response.allHeaders(), delay(5000)]);
      if (allHeaders) {
        headers = redactHeaders(allHeaders, redaction);
        headersSource = "all";
      }
    } catch {
      // Keep the sync headers already captured above.
    }

    const event: ApiResponseEvent = {
      type: "api_response",
      correlationId,
      timestamp: Date.now(),
      status: response.status(),
      headers,
      headersSource,
      bodyKind: capture.bodyKind,
      body: capture.body ?? null,
      bodyTruncated: capture.bodyTruncated,
      ...(capture.bodyBytes !== undefined ? { bodyBytes: capture.bodyBytes } : {}),
    };
    writeQueue.push(Object.freeze(event));
  });

  context.on("requestfailed", (request: Request) => {
    const correlationId = inflight.get(request);
    if (!correlationId) return;
    inflight.delete(request);
    const event: ApiResponseEvent = {
      type: "api_response",
      correlationId,
      timestamp: Date.now(),
      status: 0, // requestfailed (§3.3)
      headers: {},
      bodyKind: "unavailable",
      body: null,
      bodyTruncated: false,
    };
    writeQueue.push(Object.freeze(event));
  });

  // ---- main page ----
  const page = await context.newPage();

  const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => "unknown");
  const startedAt = Date.now();
  const meta: RecordingMeta = {
    version: 3,
    sessionId,
    startUrl: opts.url,
    startedAt,
    userAgent,
    recorderVersion: RECORDER_VERSION,
    ...(opts.sessionName ? { sessionName: opts.sessionName } : {}),
    ...(opts.goal ? { goal: opts.goal } : {}),
    ...(opts.authProfile ? { authProfile: opts.authProfile } : {}),
    ...(opts.operator ? { operator: opts.operator } : {}),
  };
  RecordingMetaSchema.parse(meta);
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  try {
    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    log.warn({ err }, "page load timeout (continuing)");
  }

  let stopped = false;

  return {
    sessionId,
    sessionDir,
    page,
    context,
    async stop(stopOpts?: { goal?: string }): Promise<RecorderResult> {
      if (stopped) throw new Error("recorder already stopped");
      stopped = true;

      // Flush any still-pending requests so nothing is silently dropped (§3.3).
      for (const [, correlationId] of inflight) {
        writeQueue.push(
          Object.freeze({
            type: "api_response",
            correlationId,
            timestamp: Date.now(),
            status: -1,
            headers: {},
            bodyKind: "unavailable",
            body: null,
            bodyTruncated: false,
          }),
        );
      }
      inflight.clear();
      await writeQueue.drain();

      const endedAt = Date.now();
      const finalMeta: RecordingMeta = {
        ...meta,
        endedAt,
        ...(stopOpts?.goal ? { goal: stopOpts.goal } : {}),
      };
      writeFileSync(metaPath, `${JSON.stringify(finalMeta, null, 2)}\n`);

      const summary: RecordingSummary = RecordingSummarySchema.parse({
        sessionId,
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        totalEvents: writeQueue.totalEvents,
        eventCounts: writeQueue.eventCounts,
        distinctEndpoints: writeQueue.distinctEndpoints,
        warnings: writeQueue.warnings,
      });
      writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

      await context.close();
      await browser.close();

      return { sessionId, sessionDir, metaPath, eventsPath, summaryPath, summary };
    },
  };
}
