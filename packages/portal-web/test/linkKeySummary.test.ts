import { describe, expect, it } from "vitest";
import { setKeys, summarizeLinkKeys } from "../src/linkKeySummary.js";

type E = { consumerLocation: "path" | "query" | "requestBody" | "requestHeader"; consumerJsonPath: string; producerJsonPath: string };
const e = (consumerLocation: E["consumerLocation"], consumerJsonPath: string, producerJsonPath = "$.v"): E => ({
  consumerLocation,
  consumerJsonPath,
  producerJsonPath,
});

const edges: E[] = [
  e("requestHeader", "Cookie.sid", "Set-Cookie.sid"),
  e("requestHeader", "Cookie.sid", "Set-Cookie.sid"),
  e("requestHeader", "Cookie.theme", "Set-Cookie.theme"),
  e("requestHeader", "x-csrf-token", "$.csrf"),
  e("path", "ticketId", "$.data.id"),
  e("path", "ticketId", "$.id"),
  e("path", "ticketId", "$.data.id"),
  e("requestBody", "$.customer.id", "$.data.customerId"),
];

describe("summarizeLinkKeys", () => {
  it("groups keys in the fixed order and skips empty groups", () => {
    const s = summarizeLinkKeys(edges, []);
    expect(s.groups.map((g) => g.label)).toEqual(["Cookies", "Headers", "Path", "Body"]);
    expect(s.totalLinks).toBe(8);
  });

  it("counts links per key and group, most used key first", () => {
    const cookies = summarizeLinkKeys(edges, []).groups[0];
    expect(cookies?.links).toBe(3);
    expect(cookies?.keys.map((k) => [k.path, k.links])).toEqual([
      ["Cookie.sid", 2],
      ["Cookie.theme", 1],
    ]);
  });

  it("hints the most common producer path for a key", () => {
    const path = summarizeLinkKeys(edges, []).groups.find((g) => g.group === "path");
    expect(path?.keys[0]).toMatchObject({ key: "path:ticketId", from: "$.data.id", links: 3 });
  });

  it("marks excluded keys and counts their links as hidden", () => {
    const s = summarizeLinkKeys(edges, ["requestHeader:Cookie.sid", "path:ticketId"]);
    expect(s.hiddenLinks).toBe(5);
    expect(s.excludedKeys).toBe(2);
    expect(s.groups[0]?.keys.find((k) => k.path === "Cookie.sid")?.excluded).toBe(true);
    expect(s.groups[0]?.keys.find((k) => k.path === "Cookie.theme")?.excluded).toBe(false);
  });

  it("ignores stale excluded keys in hidden count but reports them", () => {
    const s = summarizeLinkKeys(edges, ["query:gone"]);
    expect(s.hiddenLinks).toBe(0);
    expect(s.excludedKeys).toBe(1);
  });

  it("returns no groups for a session without links", () => {
    expect(summarizeLinkKeys([], [])).toEqual({ groups: [], totalLinks: 0, hiddenLinks: 0, excludedKeys: 0 });
  });
});

describe("setKeys", () => {
  it("adds and removes keys, sorted and deduplicated", () => {
    expect(setKeys(["b"], ["a", "b"], true)).toEqual(["a", "b"]);
    expect(setKeys(["a", "b"], ["a"], false)).toEqual(["b"]);
  });

  it("composes: a second change builds on the result of the first", () => {
    const afterFirst = setKeys([], ["requestHeader:Cookie.sid"], true);
    expect(setKeys(afterFirst, ["path:ticketId"], true)).toEqual(["path:ticketId", "requestHeader:Cookie.sid"]);
  });
});
