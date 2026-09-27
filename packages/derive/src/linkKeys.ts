import type { SessionCallEdge } from "@backbencher/schemas";

// A link's key is where its value is *used*: the consumer location plus the consumer path, e.g.
// "requestHeader:Cookie.JSESSIONID" or "path:ticketId". The session graph's Links filter and the
// server's delete check both hide links through withoutExcludedLinks, so they can never disagree
// about which links an analyst has switched off. Browser-safe: no Node imports.

export type LinkKeyEdge = Pick<SessionCallEdge, "consumerLocation" | "consumerJsonPath">;
export type LinkKeyGroup = "cookie" | "header" | "path" | "query" | "body";

export function linkKey(edge: LinkKeyEdge): string {
  return `${edge.consumerLocation}:${edge.consumerJsonPath}`;
}

/** The consumer path part of a key. Locations never contain ":", but paths may, so split once. */
export function linkKeyPath(key: string): string {
  const i = key.indexOf(":");
  return i === -1 ? key : key.slice(i + 1);
}

export function linkKeyGroup(key: string): LinkKeyGroup {
  const i = key.indexOf(":");
  const location = i === -1 ? key : key.slice(0, i);
  if (location === "path") return "path";
  if (location === "query") return "query";
  if (location === "requestBody") return "body";
  // derivation decomposes the Cookie header into one consumer per cookie, named "Cookie.<name>"
  return linkKeyPath(key).startsWith("Cookie.") ? "cookie" : "header";
}

export function withoutExcludedLinks<E extends LinkKeyEdge>(edges: readonly E[], excludedKeys: Iterable<string>): E[] {
  const excluded = new Set(excludedKeys);
  return edges.filter((e) => !excluded.has(linkKey(e)));
}
