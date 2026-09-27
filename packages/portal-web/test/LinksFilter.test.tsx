import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { summarizeLinkKeys } from "../src/linkKeySummary.js";
import { LinksFilter } from "../src/screens/LinksFilter.js";

type E = { consumerLocation: "path" | "query" | "requestBody" | "requestHeader"; consumerJsonPath: string; producerJsonPath: string };
const edges: E[] = [
  { consumerLocation: "requestHeader", consumerJsonPath: "Cookie.sid", producerJsonPath: "Set-Cookie.sid" },
  { consumerLocation: "requestHeader", consumerJsonPath: "Cookie.theme", producerJsonPath: "Set-Cookie.theme" },
  { consumerLocation: "path", consumerJsonPath: "ticketId", producerJsonPath: "$.data.id" },
];

function setup(excluded: string[] = [], overrides: Partial<Parameters<typeof LinksFilter>[0]> = {}) {
  const onSetExcluded = vi.fn();
  const onShowAll = vi.fn();
  render(
    <LinksFilter
      summary={summarizeLinkKeys(edges, excluded)}
      locked={false}
      saving={false}
      error={null}
      onSetExcluded={onSetExcluded}
      onShowAll={onShowAll}
      {...overrides}
    />,
  );
  return { onSetExcluded, onShowAll };
}

const open = () => fireEvent.click(screen.getByRole("button", { name: /^Links/ }));

describe("LinksFilter", () => {
  afterEach(cleanup);

  it("labels the button with the number of hidden links", () => {
    setup(["requestHeader:Cookie.sid"]);
    expect(screen.getByRole("button", { name: "Links · 1 hidden" })).toBeTruthy();
  });

  it("lists groups with their keys and producer hints", () => {
    setup();
    open();
    expect(screen.getByText("Cookies")).toBeTruthy();
    expect(screen.getByText("Path")).toBeTruthy();
    expect(screen.getByText("from $.data.id")).toBeTruthy();
    expect(screen.getByText("3 of 3 links shown")).toBeTruthy();
  });

  it("unticking a key excludes just that key", () => {
    const { onSetExcluded } = setup();
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cookie.sid" }));
    expect(onSetExcluded).toHaveBeenCalledWith(["requestHeader:Cookie.sid"], true);
  });

  it("the group checkbox excludes every key in the group when all are on", () => {
    const { onSetExcluded } = setup();
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "All Cookies" }));
    expect(onSetExcluded).toHaveBeenCalledWith(["requestHeader:Cookie.sid", "requestHeader:Cookie.theme"], true);
  });

  it("the group checkbox turns a mixed group back on", () => {
    const { onSetExcluded } = setup(["requestHeader:Cookie.sid"]);
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "All Cookies" }));
    expect(onSetExcluded).toHaveBeenCalledWith(["requestHeader:Cookie.sid", "requestHeader:Cookie.theme"], false);
  });

  it("group checkbox with a search only toggles matching keys", () => {
    const { onSetExcluded } = setup();
    open();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search keys" }), { target: { value: "theme" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "All Cookies" }));
    expect(onSetExcluded).toHaveBeenCalledWith(["requestHeader:Cookie.theme"], true);
  });

  it("is locked while deletions are staged", () => {
    setup([], { locked: true });
    open();
    expect((screen.getByRole("checkbox", { name: "Cookie.sid" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Save or discard your staged changes first")).toBeTruthy();
  });

  it("Show all is enabled when only stale keys are excluded", () => {
    const { onShowAll } = setup(["query:gone"]);
    open();
    const showAll = screen.getByRole("button", { name: "Show all" }) as HTMLButtonElement;
    expect(showAll.disabled).toBe(false);
    fireEvent.click(showAll);
    expect(onShowAll).toHaveBeenCalled();
  });

  it("Esc closes the panel without reaching window listeners", () => {
    setup();
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    open();
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search keys" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Links filter" })).toBeNull();
    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKey);
  });

  it("Esc closes only the panel even when focus is outside it", () => {
    setup();
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    open();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Links filter" })).toBeNull();
    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKey);
  });

  it("says so when the session has no links", () => {
    render(
      <LinksFilter
        summary={summarizeLinkKeys([], [])}
        locked={false}
        saving={false}
        error={null}
        onSetExcluded={vi.fn()}
        onShowAll={vi.fn()}
      />,
    );
    open();
    expect(screen.getByText("This session has no links.")).toBeTruthy();
  });
});
