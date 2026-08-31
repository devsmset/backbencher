import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type KnowledgePack, KnowledgePackSchema } from "@backbencher/schemas";
import { type EnvironmentConfig, dataDir, loadConfig } from "@backbencher/shared";
import { type Store, mergeOperation } from "@backbencher/store";

// Knowledge pack builder (architecture §7.1). Queries approved + annotated knowledge, applies
// the merge rule (§6.4), and emits a versioned, content-hashed pack. Determinism: every array
// is sorted and the hash is over canonical JSON, so identical knowledge ⇒ identical hash.

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = canonical((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

function stableStringify(v: unknown): string {
  return JSON.stringify(canonical(v));
}

export interface BuildPackOptions {
  environments?: EnvironmentConfig[];
  outDir?: string;
}

export interface BuildPackResult {
  pack: KnowledgePack;
  dir: string;
  packJsonPath: string;
  catalogMdPath: string;
}

export function buildKnowledgePack(store: Store, opts: BuildPackOptions = {}): BuildPackResult {
  const environments = opts.environments ?? loadConfig().environments;

  const annotations = new Map(store.annotations.list().map((a) => [a.operationId, a]));
  const testingAnnotations = new Map(store.testingAnnotations.list().map((a) => [a.operationId, a]));
  const merged = store.operations
    .list()
    .map((o) => mergeOperation(o, annotations.get(o.operationId) ?? null, testingAnnotations.get(o.operationId) ?? null))
    .filter((m) => m.reviewState !== "ignored") // §6.4: ignored ops excluded entirely
    .sort((a, b) => a.operationId.localeCompare(b.operationId));

  const catalog = merged.map((m) => ({
    operationId: m.operationId,
    method: m.method,
    template: m.pathTemplate.template,
    ...(m.name ? { name: m.name } : {}),
    ...(m.does ? { does: m.does } : {}),
    ...(m.productArea ? { area: m.productArea } : {}),
    ...(m.sideEffect ? { sideEffect: m.sideEffect } : {}),
    auth: m.authObserved,
    statuses: Object.keys(m.statusCodesObserved)
      .map(Number)
      .sort((a, b) => a - b),
    reviewState: m.reviewState,
  }));

  const operations: Record<string, unknown> = {};
  for (const m of merged) operations[m.operationId] = m;

  const exemplars = store.exemplars.list().sort((a, b) => a.exemplarId.localeCompare(b.exemplarId));
  const compositions = store.compositions
    .listByStatus("approved")
    .sort((a, b) => a.compositionId.localeCompare(b.compositionId));

  const guides = store.guides.list().sort((a, b) => a.guideId.localeCompare(b.guideId));

  const dataflow = store.dataflow
    .all()
    .filter((e) => e.evidenceCount >= 2) // §5.5.5: pack includes weight >= 2 only
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));

  const authProfiles = [
    ...new Set(
      store.sessions
        .list()
        .map((s) => s.authProfile)
        .filter((x): x is string => Boolean(x)),
    ),
  ]
    .sort()
    .map((name) => ({ name, description: `Observed auth profile "${name}"` }));

  const envs = environments.map((e) => ({
    name: e.name,
    baseUrl: e.baseUrl,
    destructive: e.destructive,
  }));

  const core = { catalog, operations, exemplars, compositions, guides, dataflow, authProfiles, environments: envs };
  const contentHash = createHash("sha256").update(stableStringify(core)).digest("hex").slice(0, 16);

  const pack = KnowledgePackSchema.parse({
    version: 1,
    builtAt: Date.now(),
    contentHash,
    ...core,
  });

  const dir = opts.outDir ?? join(dataDir(), "knowledge-packs", contentHash);
  mkdirSync(dir, { recursive: true });
  const packJsonPath = join(dir, "pack.json");
  const catalogMdPath = join(dir, "catalog.md");
  writeFileSync(packJsonPath, `${JSON.stringify(pack, null, 2)}\n`);
  writeFileSync(catalogMdPath, `${renderCatalogMd(pack)}\n`);

  store.packs.insert({ packId: contentHash, builtAt: pack.builtAt, contentHash, path: packJsonPath });

  return { pack, dir, packJsonPath, catalogMdPath };
}

function renderCatalogMd(pack: KnowledgePack): string {
  const lines: string[] = [
    `# Knowledge Pack \`${pack.contentHash}\``,
    "",
    `Built: ${new Date(pack.builtAt).toISOString()}`,
    "",
    `## Operations (${pack.catalog.length})`,
    "",
    "| Method | Template | Name | Area | Auth | Statuses | Review |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const c of pack.catalog) {
    const row = c as {
      method: string;
      template: string;
      name?: string;
      area?: string;
      auth: string;
      statuses: number[];
      reviewState: string;
    };
    lines.push(
      `| ${row.method} | ${row.template} | ${row.name ?? ""} | ${row.area ?? ""} | ${row.auth} | ${row.statuses.join(", ")} | ${row.reviewState} |`,
    );
  }
  lines.push(
    "",
    `## Exemplars (${pack.exemplars.length})`,
    "",
    `## Compositions (${pack.compositions.length})`,
    "",
    `## Guides (${pack.guides.length})`,
    "",
  );
  return lines.join("\n");
}

export interface PackDiff {
  addedOperations: string[];
  removedOperations: string[];
  changedOperations: string[];
  sameHash: boolean;
}

export function packDiff(a: KnowledgePack, b: KnowledgePack): PackDiff {
  const aOps = new Map(Object.entries(a.operations));
  const bOps = new Map(Object.entries(b.operations));
  const added = [...bOps.keys()].filter((k) => !aOps.has(k)).sort();
  const removed = [...aOps.keys()].filter((k) => !bOps.has(k)).sort();
  const changed = [...aOps.keys()]
    .filter((k) => bOps.has(k) && stableStringify(aOps.get(k)) !== stableStringify(bOps.get(k)))
    .sort();
  return {
    addedOperations: added,
    removedOperations: removed,
    changedOperations: changed,
    sameHash: a.contentHash === b.contentHash,
  };
}
