import { type RedactionConfig, redactJsonBody } from "@backbencher/shared";
import type { Response } from "playwright";

// Response body handling (architecture §3.4). Read eagerly inside the response handler —
// lazily-read bodies get evicted from Playwright's buffer.

export interface BodyCapture {
  bodyKind: "json" | "text" | "binary" | "empty" | "unavailable";
  body: unknown;
  bodyBytes?: number;
  bodyTruncated: boolean;
}

export async function captureBody(
  response: Response,
  cap: number,
  cfg: RedactionConfig,
): Promise<BodyCapture> {
  const ct = (response.headers()["content-type"] ?? "").toLowerCase();
  let buf: Buffer;
  try {
    buf = await response.body();
  } catch {
    // 204s, redirects, evicted bodies
    return { bodyKind: "unavailable", body: null, bodyTruncated: false };
  }
  if (buf.length === 0) return { bodyKind: "empty", body: null, bodyTruncated: false };
  if (!ct.includes("json") && !ct.startsWith("text/")) {
    return { bodyKind: "binary", body: null, bodyBytes: buf.length, bodyTruncated: false };
  }
  const truncated = buf.length > cap;
  const text = buf.subarray(0, cap).toString("utf8");
  if (ct.includes("json") && !truncated) {
    try {
      const parsed: unknown = JSON.parse(text);
      return {
        bodyKind: "json",
        body: redactJsonBody(parsed, cfg),
        bodyBytes: buf.length,
        bodyTruncated: false,
      };
    } catch {
      // fall through to text
    }
  }
  return { bodyKind: "text", body: text, bodyBytes: buf.length, bodyTruncated: truncated };
}
