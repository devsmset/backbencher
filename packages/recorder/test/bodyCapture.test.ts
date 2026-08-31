import type { Response } from "playwright";
import { describe, expect, it } from "vitest";
import { captureBody } from "../src/bodyCapture.js";

// captureBody only ever calls headers() and body(); a structural stand-in avoids a live browser.
function fakeResponse(headers: Record<string, string>, body: Buffer): Response {
  return { headers: () => headers, body: async () => body } as unknown as Response;
}

describe("captureBody", () => {
  it("keeps a JSON body larger than the old 256 KiB cap as parsed JSON", async () => {
    const big = { note: "x".repeat(300_000) };
    const buf = Buffer.from(JSON.stringify(big), "utf8");

    const capture = await captureBody(fakeResponse({ "content-type": "application/json" }, buf));

    expect(capture.bodyKind).toBe("json");
    expect(capture.body).toEqual(big);
    expect(capture.bodyBytes).toBe(buf.length);
  });

  it("keeps secret-named fields verbatim", async () => {
    const buf = Buffer.from(JSON.stringify({ password: "hunter2", token: "abc123" }), "utf8");

    const capture = await captureBody(fakeResponse({ "content-type": "application/json" }, buf));

    expect(capture.body).toEqual({ password: "hunter2", token: "abc123" });
  });

  it("still drops a binary body but records its size", async () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const capture = await captureBody(fakeResponse({ "content-type": "image/png" }, buf));

    expect(capture.bodyKind).toBe("binary");
    expect(capture.body).toBeNull();
    expect(capture.bodyBytes).toBe(4);
  });
});
