import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CollapsibleJson } from "../src/screens/SessionGraph.js";

// Same rationale as CallRow's lazy body rendering (packages/portal-web/test/CallRow.test.tsx):
// <details> only hides content visually, so an un-gated JsonBlock still mounts (and, for large
// captured bodies, can still hang the tab) even while collapsed. Used by NodeDetails so the
// dependency graph's side panel starts collapsed on every node selection, not just once.

const marker = "BODY_MARKER";

describe("CollapsibleJson", () => {
  afterEach(cleanup);

  it("does not render its value while collapsed", () => {
    render(<CollapsibleJson label="Request" value={{ value: marker }} />);
    expect(screen.queryByText(new RegExp(marker))).toBeNull();
  });

  it("renders its value once expanded", () => {
    render(<CollapsibleJson label="Request" value={{ value: marker }} />);
    const details = screen.getByText("Request").closest("details") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.queryByText(new RegExp(marker))).not.toBeNull();
  });

  it("defaults to collapsed regardless of prior state, when remounted with a fresh key", () => {
    const { rerender } = render(<CollapsibleJson key="a" label="Request" value={{ value: marker }} />);
    const details = screen.getByText("Request").closest("details") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.queryByText(new RegExp(marker))).not.toBeNull();

    rerender(<CollapsibleJson key="b" label="Request" value={{ value: marker }} />);
    expect(screen.queryByText(new RegExp(marker))).toBeNull();
  });
});
