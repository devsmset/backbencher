import type { Response } from "playwright";

// Response body handling (architecture §3.4). Read eagerly inside the response handler —
// lazily-read bodies get evicted from Playwright's buffer.

export interface BodyCapture {
  bodyKind: "json" | "text" | "binary" | "empty" | "unavailable";
  body: unknown;
  bodyBytes?: number;
  bodyTruncated: boolean;
}

export async function captureBody(response: Response): Promise<BodyCapture> {
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
  const text = buf.toString("utf8");
  if (ct.includes("json")) {
    try {
      const parsed: unknown = JSON.parse(text);
      return { bodyKind: "json", body: parsed, bodyBytes: buf.length, bodyTruncated: false };
    } catch {
      // malformed JSON — keep the raw text rather than losing the body
    }
  }
  return { bodyKind: "text", body: text, bodyBytes: buf.length, bodyTruncated: false };
}
