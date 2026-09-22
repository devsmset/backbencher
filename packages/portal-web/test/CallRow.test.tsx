import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CallRow, type ApiCallRow } from "../src/screens/Sessions.js";

// Root cause under test: a session's "API calls" panel renders every call's request/response
// body unconditionally, even inside a collapsed <details>. <details> only hides content via
// display:none — React still mounts the children — so an oversized, uncapped response body
// (captured verbatim per ADR-0006; real-world sessions have hit 2MB+ single bodies) gets
// recursively expanded into hundreds of thousands of React elements on every page load, which
// is what actually hangs the browser tab (confirmed: backend responds in <25ms; the hang is
// 100% client-side render work). The body must only render once the analyst opens that call.

const marker = "RESPONSE_BODY_MARKER";

const call: ApiCallRow = {
  correlationId: "c1",
  ts: 0,
  method: "GET",
  url: "https://example.com/api/thing",
  status: 200,
  durationMs: 12,
  reqHeaders: {},
  reqBody: null,
  resHeaders: {},
  resBody: { value: marker },
  bodyKind: "json",
};

describe("CallRow", () => {
  // render() appends to document.body without unmounting between tests, so without this,
  // getByText below would match the previous test's leftover DOM too.
  afterEach(cleanup);

  it("does not render the response body while collapsed", () => {
    render(<CallRow call={call} />);
    expect(screen.queryByText(new RegExp(marker))).toBeNull();
  });

  it("renders the response body once expanded", () => {
    render(<CallRow call={call} />);
    // jsdom doesn't toggle <details> from a synthetic click, so open it directly and dispatch
    // the native "toggle" event CallRow listens for.
    const details = screen.getByText(call.url).closest("details") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.queryByText(new RegExp(marker))).not.toBeNull();
  });
});
