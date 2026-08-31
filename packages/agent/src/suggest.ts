import { type CatalogAnnotation, CatalogAnnotationSchema, SideEffect } from "@backbencher/schemas";
import type { Store } from "@backbencher/store";
import { z } from "zod";
import type { LlmComplete } from "./generate.js";

// Suggested catalog annotations (realignment guide §4.2). Catalog readiness gates composition, and
// a real app has hundreds of endpoints, so this is what stops the loop stalling on manual typing.
// Suggestions are written with `suggested: true`, which deliberately does NOT make an Operation
// Ready: if machine guesses counted as coverage the dashboard would start lying and the composer
// would select endpoints nobody verified.

const SuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      operationId: z.string(),
      name: z.string(),
      does: z.string(),
      productArea: z.string().optional(),
      sideEffect: SideEffect.optional(),
    }),
  ),
});

const SYSTEM = `You document REST API endpoints for a QA catalog.
For each endpoint you are given the method, path template, observed status codes, and a sample of
observed request/response field names. Produce:
- name: a short Title Case action name ("Create Ticket", "List Users")
- does: ONE sentence describing what calling it accomplishes, in product terms
- productArea: the feature area it belongs to ("Ticketing", "Billing"), if evident
- sideEffect: one of read | create | update | delete | auth | unknown
Rules:
- Never invent endpoints or operationIds; return one suggestion per input endpoint.
- Prefer the product's own vocabulary from the field names over generic REST phrasing.
- Return JSON only.`;

function fieldNames(schema: unknown, limit = 12): string[] {
  const props = (schema as { properties?: Record<string, unknown> } | null)?.properties;
  return props ? Object.keys(props).slice(0, limit) : [];
}

export interface SuggestOptions {
  llm: LlmComplete;
  actor: string;
  /** Cap per call so one bulk run over a large catalog stays inside a sane context budget. */
  batchSize?: number;
  /** Re-suggest for operations that already have a suggestion. Never touches accepted annotations. */
  force?: boolean;
}

export interface SuggestResult {
  considered: number;
  suggested: number;
  annotations: CatalogAnnotation[];
}

export async function suggestAnnotations(store: Store, opts: SuggestOptions): Promise<SuggestResult> {
  const existing = new Map(store.annotations.list().map((a) => [a.operationId, a]));
  const targets = store.operations.list().filter((op) => {
    const a = existing.get(op.operationId);
    if (!a) return true;
    if (a.reviewState === "ignored") return false;
    return a.suggested ? Boolean(opts.force) : !a.name || !a.does;
  });
  if (targets.length === 0) return { considered: 0, suggested: 0, annotations: [] };

  const batchSize = opts.batchSize ?? 25;
  const saved: CatalogAnnotation[] = [];

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const described = batch.map((op) => {
      const statuses = Object.keys(op.statusCodesObserved).join(",");
      const req = fieldNames(op.requestSchema);
      const res = fieldNames(Object.values(op.responseSchemas)[0]);
      return [
        `- operationId: ${op.operationId}`,
        `  endpoint: ${op.method} ${op.pathTemplate.template}`,
        `  statuses: ${statuses}`,
        req.length > 0 ? `  requestFields: ${req.join(", ")}` : null,
        res.length > 0 ? `  responseFields: ${res.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    });

    const user = `ENDPOINTS:\n${described.join("\n")}\n\nReturn JSON: {"suggestions":[{"operationId":"...","name":"...","does":"...","productArea":"...","sideEffect":"..."}]}`;

    let parsed: z.infer<typeof SuggestionSchema>;
    try {
      const raw = await opts.llm(SYSTEM, user);
      parsed = SuggestionSchema.parse(JSON.parse(raw.replace(/^\s*```(?:json)?|```\s*$/g, "").trim()));
    } catch {
      continue; // a failed batch is skipped, not fatal — the rest of the catalog still gets suggestions
    }

    const batchIds = new Set(batch.map((op) => op.operationId));
    for (const s of parsed.suggestions) {
      if (!batchIds.has(s.operationId)) continue; // ignore hallucinated ids
      const prior = existing.get(s.operationId);
      if (prior && !prior.suggested && prior.name && prior.does) continue; // never overwrite a human
      saved.push(
        store.annotations.upsert(
          CatalogAnnotationSchema.parse({
            operationId: s.operationId,
            name: s.name,
            does: s.does,
            ...(s.productArea ? { productArea: s.productArea } : {}),
            ...(s.sideEffect ? { sideEffect: s.sideEffect } : {}),
            suggested: true,
            reviewState: "unannotated",
            updatedBy: opts.actor,
            updatedAt: Date.now(),
          }),
        ),
      );
    }
  }

  return { considered: targets.length, suggested: saved.length, annotations: saved };
}
