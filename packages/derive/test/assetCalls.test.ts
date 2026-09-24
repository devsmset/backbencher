import { describe, expect, it } from "vitest";
import { isAssetLikeCall } from "../src/assetCalls.js";

const call = (pathname: string, responseContentType?: string, requestContentType?: string) => ({
  pathname,
  responseContentType,
  requestContentType,
});

describe("isAssetLikeCall", () => {
  it("drops by response content-type prefix", () => {
    expect(isAssetLikeCall(call("/x", "image/png"))).toBe(true);
    expect(isAssetLikeCall(call("/x", "font/woff2"))).toBe(true);
  });
  it("drops css and javascript", () => {
    expect(isAssetLikeCall(call("/x", "text/css; charset=utf-8"))).toBe(true);
    expect(isAssetLikeCall(call("/x", "text/javascript"))).toBe(true);
  });
  it("drops by path extension", () => {
    expect(isAssetLikeCall(call("/logo.svg"))).toBe(true);
    expect(isAssetLikeCall(call("/a.woff2?v=1"))).toBe(true);
  });
  it("falls back to the request content-type when the response has none", () => {
    expect(isAssetLikeCall(call("/x", undefined, "IMAGE/PNG"))).toBe(true);
  });
  it("keeps a normal JSON API call", () => {
    expect(isAssetLikeCall(call("/api/tickets", "application/json"))).toBe(false);
  });
});
