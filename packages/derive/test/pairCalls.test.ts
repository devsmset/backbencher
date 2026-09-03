import { describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../fixtures/sessions.js";
import { pairCalls } from "../src/pairCalls.js";

describe("pairCalls", () => {
  it("carries request/response headers, body, and bodyKind onto the paired call", () => {
    resetClock();
    const session = makeSession("sess-headers", [
      ...apiCall("c1", {
        url: "https://app.example.net/bo/userProfile",
        reqHeaders: { authorization: "Bearer t" },
        postData: '{"q":1}',
        resHeaders: { "content-type": "application/json" },
        body: { ok: true },
        bodyKind: "json",
      }),
    ]);
    const [call] = pairCalls(session);

    expect(call.requestHeaders).toEqual({ authorization: "Bearer t" });
    expect(call.requestBody).toEqual({ q: 1 });
    expect(call.responseHeaders).toEqual({ "content-type": "application/json" });
    expect(call.responseBody).toEqual({ ok: true });
    expect(call.responseBodyKind).toBe("json");
  });
});
