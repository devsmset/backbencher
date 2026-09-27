import { type LinkKeyEdge, type LinkKeyGroup, linkKey, linkKeyGroup, linkKeyPath } from "@backbencher/derive/linkKeys";

// Data behind the dependency graph's Links panel: every link key the graph is built on, grouped,
// with how many links use it and where its value usually comes from. Pure, so it's testable
// without rendering the graph.

const GROUP_ORDER: LinkKeyGroup[] = ["cookie", "header", "path", "query", "body"];
const GROUP_LABEL: Record<LinkKeyGroup, string> = {
  cookie: "Cookies",
  header: "Headers",
  path: "Path",
  query: "Query",
  body: "Body",
};

export interface LinkKeyRow {
  key: string;
  path: string;
  links: number;
  /** The producer path this key's value most often comes from, as a hint. */
  from: string;
  excluded: boolean;
}

export interface LinkKeyGroupSummary {
  group: LinkKeyGroup;
  label: string;
  links: number;
  keys: LinkKeyRow[];
}

export interface LinkKeySummary {
  groups: LinkKeyGroupSummary[];
  totalLinks: number;
  /** Links currently hidden. Excluded keys no link uses don't count. */
  hiddenLinks: number;
  /** Every excluded key, including ones no current link uses (so "Show all" can clear them). */
  excludedKeys: number;
}

function mostCommon(counts: Map<string, number>): string {
  let best = "";
  let bestCount = 0;
  for (const [value, n] of counts) {
    if (n > bestCount || (n === bestCount && value.localeCompare(best) < 0)) {
      best = value;
      bestCount = n;
    }
  }
  return best;
}

export function summarizeLinkKeys(
  edges: readonly (LinkKeyEdge & { producerJsonPath: string })[],
  excludedKeys: Iterable<string>,
): LinkKeySummary {
  const excluded = new Set(excludedKeys);
  const byKey = new Map<string, { links: number; producers: Map<string, number> }>();
  for (const e of edges) {
    const key = linkKey(e);
    const entry = byKey.get(key) ?? { links: 0, producers: new Map<string, number>() };
    entry.links += 1;
    entry.producers.set(e.producerJsonPath, (entry.producers.get(e.producerJsonPath) ?? 0) + 1);
    byKey.set(key, entry);
  }

  const groups = GROUP_ORDER.map((group) => {
    const keys = [...byKey]
      .filter(([key]) => linkKeyGroup(key) === group)
      .map(([key, v]) => ({
        key,
        path: linkKeyPath(key),
        links: v.links,
        from: mostCommon(v.producers),
        excluded: excluded.has(key),
      }))
      .sort((a, b) => b.links - a.links || a.path.localeCompare(b.path));
    return { group, label: GROUP_LABEL[group], links: keys.reduce((n, k) => n + k.links, 0), keys };
  }).filter((g) => g.keys.length > 0);

  const hiddenLinks = groups.flatMap((g) => g.keys).reduce((n, k) => n + (k.excluded ? k.links : 0), 0);
  return { groups, totalLinks: edges.length, hiddenLinks, excludedKeys: excluded.size };
}

/** `current` with `keys` switched off (`excluded` true) or back on. Sorted, deduplicated. */
export function setKeys(current: readonly string[], keys: readonly string[], excluded: boolean): string[] {
  const next = new Set(current);
  for (const key of keys) {
    if (excluded) next.add(key);
    else next.delete(key);
  }
  return [...next].sort();
}
