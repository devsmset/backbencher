import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApiRequestEvent,
  type ApiResponseEvent,
  type RecordingMeta,
  type RecordingMetaDraft,
  RecordingMetaDraftSchema,
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
} from "@backbencher/shared";
import { type Browser, type BrowserContext, type Page, type Request, type Response, chromium } from "playwright";
import { makeApiFilter, shouldDropCapturedResponse } from "./apiFilter.js";
import { captureBody } from "./bodyCapture.js";
import { WriteQueue } from "./writeQueue.js";

export const RECORDER_VERSION = "4.0.0";

const log = childLogger({ mod: "recorder" });

export interface StartRecordingOptions {
  url: string;
  config?: BbConfig;
  headless?: boolean;
  authProfile?: string;
  operator?: string;
}

/** The analyst's own words, collected when they stop. Both are required to save a session. */
export interface StopRecordingOptions {
  name: string;
  goal: string;
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
  stop(opts: StopRecordingOptions): Promise<RecorderResult>;
  /** Abandon the recording without saving a session; used when the analyst supplies no name/goal. */
  discard(): Promise<void>;
}

function mapResourceType(rt: string): ApiRequestEvent["resourceType"] {
  if (rt === "xhr" || rt === "fetch" || rt === "document") return rt;
  return "other";
}

const delay = (ms: number): Promise<null> =>
  new Promise((resolve) => setTimeout(() => resolve(null), ms));

interface InflightEntry {
  correlationId: string;
  event: ApiRequestEvent;
  /** Resolves when the allHeaders() upgrade has finished mutating `event`. */
  headersUpgraded: Promise<void>;
}

export async function startRecording(opts: StartRecordingOptions): Promise<RecorderHandle> {
  const config = opts.config ?? loadConfig();
  const rec = config.recorder;

  const sessionId = newId();
  const sessionDir = join(dataDir(), "sessions", sessionId);
  const metaPath = join(sessionDir, "meta.json");
  const eventsPath = join(sessionDir, "events.ndjson");
  const summaryPath = join(sessionDir, "summary.json");
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(eventsPath, "");

  const writeQueue = new WriteQueue(eventsPath, log);
  const apiFilter = makeApiFilter(rec.apiFilter);
  const inflight = new Map<Request, InflightEntry>();

  // Response handling is async: `stop()` must await these before draining, or a pair can be
  // appended after summary.json has already been written.
  const pendingResponses = new Set<Promise<void>>();

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

    let postData: string | null = null;
    try {
      postData = request.postData() ?? null;
    } catch {
      postData = null;
    }

    const event: ApiRequestEvent = {
      type: "api_request",
      correlationId,
      timestamp,
      method,
      url,
      resourceType: mapResourceType(resourceType),
      headers: request.headers(),
      headersSource: "sync",
      postData,
    };

    // Upgrade to the fuller header set if allHeaders() resolves within 5s (§3.1 bug 4). The event is
    // not written here — it is held until its response decides whether the pair is kept.
    const headersUpgraded = Promise.race([request.allHeaders(), delay(5000)])
      .then((headers) => {
        if (headers) {
          event.headers = headers;
          event.headersSource = "all";
        }
      })
      .catch(() => undefined);

    inflight.set(request, { correlationId, event, headersUpgraded });
  });

  const handleResponse = async (response: Response): Promise<void> => {
    const request = response.request();
    const entry = inflight.get(request);
    if (!entry) return;
    inflight.delete(request);

    await entry.headersUpgraded;

    // Upgrade to the fuller header set via allHeaders() (raw HTTP headers, incl. ones
    // CORS-safelisting hides from headers()), mirroring the request-side upgrade above.
    let headers = response.headers();
    let headersSource: "sync" | "all" = "sync";
    try {
      const allHeaders = await Promise.race([response.allHeaders(), delay(5000)]);
      if (allHeaders) {
        headers = allHeaders;
        headersSource = "all";
      }
    } catch {
      // Keep the sync headers already captured above.
    }

    // Drop the pair whole: writing the request without its response leaves an orphan.
    if (shouldDropCapturedResponse(rec.apiFilter, response.url(), headers, request.resourceType())) {
      return;
    }

    const capture = await captureBody(response);

    writeQueue.push(Object.freeze(entry.event));
    writeQueue.push(
      Object.freeze({
        type: "api_response",
        correlationId: entry.correlationId,
        timestamp: Date.now(),
        status: response.status(),
        headers,
        headersSource,
        bodyKind: capture.bodyKind,
        body: capture.body ?? null,
        ...(capture.bodyBytes !== undefined ? { bodyBytes: capture.bodyBytes } : {}),
      } satisfies ApiResponseEvent),
    );
  };

  context.on("response", (response: Response) => {
    const p = handleResponse(response);
    pendingResponses.add(p);
    void p.finally(() => pendingResponses.delete(p));
  });

  context.on("requestfailed", (request: Request) => {
    const entry = inflight.get(request);
    if (!entry) return;
    inflight.delete(request);
    writeQueue.push(Object.freeze(entry.event));
    writeQueue.push(
      Object.freeze({
        type: "api_response",
        correlationId: entry.correlationId,
        timestamp: Date.now(),
        status: 0, // requestfailed (§3.3)
        headers: {},
        bodyKind: "unavailable",
        body: null,
      } satisfies ApiResponseEvent),
    );
  });

  // ---- main page ----
  const page = await context.newPage();

  const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => "unknown");
  const startedAt = Date.now();
  const meta: RecordingMetaDraft = {
    version: 4,
    sessionId,
    startUrl: opts.url,
    startedAt,
    userAgent,
    recorderVersion: RECORDER_VERSION,
    ...(opts.authProfile ? { authProfile: opts.authProfile } : {}),
    ...(opts.operator ? { operator: opts.operator } : {}),
  };
  RecordingMetaDraftSchema.parse(meta);
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  try {
    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    log.warn({ err }, "page load timeout (continuing)");
  }

  let stopped = false;

  const shutdown = async (): Promise<void> => {
    await context.close();
    await browser.close();
  };

  return {
    sessionId,
    sessionDir,
    page,
    context,
    async discard(): Promise<void> {
      if (stopped) throw new Error("recorder already stopped");
      stopped = true;
      await writeQueue.drain();
      await shutdown();
      rmSync(sessionDir, { recursive: true, force: true });
      log.warn({ sessionId }, "recording discarded without a name and goal");
    },
    async stop(stopOpts: StopRecordingOptions): Promise<RecorderResult> {
      if (stopped) throw new Error("recorder already stopped");
      const name = stopOpts?.name?.trim() ?? "";
      const goal = stopOpts?.goal?.trim() ?? "";
      if (!name || !goal) {
        throw new Error("A session needs both a name and a goal to be saved; use discard() to abandon it");
      }
      stopped = true;

      // Let in-flight response handlers finish so their pairs are written before we flush.
      await Promise.allSettled([...pendingResponses]);

      // Flush any still-pending requests so nothing is silently dropped (§3.3).
      for (const [, entry] of inflight) {
        writeQueue.push(Object.freeze(entry.event));
        writeQueue.push(
          Object.freeze({
            type: "api_response",
            correlationId: entry.correlationId,
            timestamp: Date.now(),
            status: -1,
            headers: {},
            bodyKind: "unavailable",
            body: null,
          } satisfies ApiResponseEvent),
        );
      }
      inflight.clear();
      await writeQueue.drain();

      const endedAt = Date.now();
      const finalMeta: RecordingMeta = RecordingMetaSchema.parse({ ...meta, endedAt, name, goal });
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

      await shutdown();

      return { sessionId, sessionDir, metaPath, eventsPath, summaryPath, summary };
    },
  };
}
