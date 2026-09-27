import type { SessionCallEdge } from "@backbencher/schemas";
import { describe, expect, it } from "vitest";
import { linkKey, linkKeyGroup, linkKeyPath, withoutExcludedLinks } from "../src/linkKeys.js";

function edge(
  consumerLocation: SessionCallEdge["consumerLocation"],
  consumerJsonPath: string,
  consumer = "c",
): SessionCallEdge {
  return {
    producerCorrelationId: "p",
    producerLocation: "responseBody",
    producerJsonPath: "$.v",
    consumerCorrelationId: consumer,
    consumerLocation,
    consumerJsonPath,
    value: "VALUE-abcdef123",
    confidence: "strong",
  };
}

describe("linkKey", () => {
  it("joins the consumer location and path", () => {
    expect(linkKey(edge("requestHeader", "Cookie.JSESSIONID"))).toBe("requestHeader:Cookie.JSESSIONID");
    expect(linkKey(edge("requestHeader", "x-csrf-token"))).toBe("requestHeader:x-csrf-token");
    expect(linkKey(edge("path", "ticketId"))).toBe("path:ticketId");
    expect(linkKey(edge("query", "ref"))).toBe("query:ref");
    expect(linkKey(edge("requestBody", "$.customer.id"))).toBe("requestBody:$.customer.id");
  });
});

describe("linkKeyGroup and linkKeyPath", () => {
  it("groups cookies apart from other headers", () => {
    expect(linkKeyGroup("requestHeader:Cookie.JSESSIONID")).toBe("cookie");
    expect(linkKeyGroup("requestHeader:x-csrf-token")).toBe("header");
  });

  it("groups path, query and body by location", () => {
    expect(linkKeyGroup("path:ticketId")).toBe("path");
    expect(linkKeyGroup("query:ref")).toBe("query");
    expect(linkKeyGroup("requestBody:$.customer.id")).toBe("body");
  });

  it("splits on the first colon only", () => {
    expect(linkKeyPath("query:a:b")).toBe("a:b");
    expect(linkKeyGroup("query:a:b")).toBe("query");
    expect(linkKeyPath(linkKey(edge("requestHeader", "x:odd")))).toBe("x:odd");
  });
});

describe("withoutExcludedLinks", () => {
  const edges = [
    edge("requestHeader", "Cookie.sid", "c1"),
    edge("path", "ticketId", "c2"),
    edge("requestHeader", "Cookie.sid", "c3"),
    edge("query", "ref", "c4"),
  ];

  it("drops exactly the excluded keys and keeps order", () => {
    const kept = withoutExcludedLinks(edges, ["requestHeader:Cookie.sid"]);
    expect(kept.map((e) => e.consumerCorrelationId)).toEqual(["c2", "c4"]);
  });

  it("returns every link, in a new array, when nothing is excluded", () => {
    const kept = withoutExcludedLinks(edges, []);
    expect(kept).toEqual(edges);
    expect(kept).not.toBe(edges);
  });

  it("ignores excluded keys no link uses", () => {
    expect(withoutExcludedLinks(edges, ["path:gone"])).toHaveLength(4);
  });
});
