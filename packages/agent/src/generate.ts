import { type LlmTask, createLlmRegistry } from "@backbencher/llm";
import { type Composition, type TestSpec, TestSpecSchema } from "@backbencher/schemas";
import { type BbConfig, newId } from "@backbencher/shared";
import { type Store, mergeOperation } from "@backbencher/store";
import { load as loadYaml } from "js-yaml";

// QA agent generation (architecture §7.2). Context assembly → LLM → YAML → TestSpec → validate →
// (one) repair round-trip. The LLM is injectable (LlmComplete) so tests/CI run without an API key.

export type LlmComplete = (system: string, user: string) => Promise<string>;

const SYSTEM = `You are a QA test author. Emit a single TestSpec as YAML (no prose, no code fences).
Hard constraints:
- Only use operationIds that appear in the catalog; never invent one.
- Chain steps only via {{steps.<id>.extract.<var>}} where <id> is an EARLIER step that declares that extract.
- Template syntax: {{steps.x.extract.y}}, {{env.KEY}}, {{faker.uuid}}, {{faker.email}}, {{now.iso}}.
- Mint fresh values for client-generated fields; never replay recorded ids.
- Any step that writes data (POST/PUT/PATCH/DELETE) must have a matching cleanup entry.
- Respect each operation's testingGuidance.
- Output ONLY the YAML document for one TestSpec (fields: version, specId, scenarioId, title,
  environment, authProfile, tags, steps[], cleanup[]).`;

function compactCatalog(store: Store): string {
  return store.operations
    .list()
    .map((o) => {
      const merged = mergeOperation(
        o,
        store.annotations.get(o.operationId),
        store.testingAnnotations.get(o.operationId),
      );
      if (merged.reviewState === "ignored") return null;
      const statuses = Object.keys(merged.statusCodesObserved).join(",");
      return `${merged.method} ${merged.pathTemplate.template} [${merged.operationId}] auth=${merged.authObserved} statuses=${statuses} review=${merged.reviewState}`;
    })
    .filter((l): l is string => l !== null)
    .join("\n");
}

function strategyGuidance(strategy: string): string {
  switch (strategy) {
    case "api_negative":
      return "Generate NEGATIVE cases derived from each operation's request schema: missing-required fields, wrong-type values, out-of-range/boundary values, unknown-enum values, and expired/invalid auth. Each case is its own step expecting a 4xx status.";
    case "authz":
      return "Generate authorization checks: replay each state-changing operation under EACH OTHER auth profile (role), expecting 401 or 403.";
    case "contract_only":
      return "Emit GET-only steps that assert status and schema conformance. Do NOT create, update, or delete anything.";
    case "api_functional":
      return "Generate a happy-path functional flow following the composition steps, chaining ids via {{steps.*.extract.*}} and cleaning up any created resources.";
    default:
      return "";
  }
}

export function assembleContext(store: Store, composition: Composition): { system: string; user: string } {
  const stepOpIds = new Set(composition.steps.map((s) => s.operationId));

  // full merged detail for the composition's operations + their 1-hop dataflow neighbors
  const detailIds = new Set(stepOpIds);
  const edges = store.dataflow.all().filter((e) => stepOpIds.has(e.producer.operationId) || stepOpIds.has(e.consumer.operationId));
  for (const e of edges) {
    detailIds.add(e.producer.operationId);
    detailIds.add(e.consumer.operationId);
  }
  const details = [...detailIds]
    .map((id) => {
      const op = store.operations.get(id);
      return op ? mergeOperation(op, store.annotations.get(id), store.testingAnnotations.get(id)) : null;
    })
    .filter((o) => o !== null);

  const guides = store.guides
    .list()
    .filter((g) => g.priority === "must_read" && (g.scope.operationIds.some((id) => stepOpIds.has(id)) || g.scope.productArea));

  const strategy = composition.testDecision?.strategy ?? "api_functional";
  const user = [
    "## Catalog",
    compactCatalog(store),
    "",
    "## Must-read guides",
    guides.map((g) => `### ${g.title}\n${g.body}`).join("\n\n") || "(none)",
    "",
    "## Composition",
    JSON.stringify(composition, null, 2),
    "",
    "## Operation details (composition ops + 1-hop dataflow neighbors)",
    JSON.stringify(details, null, 2),
    "",
    "## Dataflow edges among these operations",
    JSON.stringify(edges, null, 2),
    "",
    `## Task: emit a TestSpec YAML for strategy=${strategy}.`,
    `## Strategy guidance (${strategy})`,
    strategyGuidance(strategy),
  ].join("\n");

  return { system: SYSTEM, user };
}

function stepExtractRefs(value: unknown): { stepId: string; varName: string }[] {
  const refs: { stepId: string; varName: string }[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      for (const m of v.matchAll(/\{\{steps\.([^.]+)\.extract\.([^}]+)\}\}/g)) {
        refs.push({ stepId: m[1] as string, varName: m[2] as string });
      }
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x);
    } else if (v !== null && typeof v === "object") {
      for (const x of Object.values(v)) walk(x);
    }
  };
  walk(value);
  return refs;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function validateSpec(
  spec: TestSpec,
  ctx: { validOperationIds: Set<string>; operationMethods: Record<string, string> },
): string[] {
  const errors: string[] = [];
  const declaredExtracts = new Map<string, Set<string>>();
  let writes = false;

  spec.steps.forEach((step, i) => {
    if (!ctx.validOperationIds.has(step.operationId)) {
      errors.push(`step "${step.id}": unknown operationId "${step.operationId}"`);
    }
    if (WRITE_METHODS.has(ctx.operationMethods[step.operationId] ?? "")) writes = true;

    for (const ref of stepExtractRefs(step.request)) {
      const priorIds = spec.steps.slice(0, i).map((s) => s.id);
      if (!priorIds.includes(ref.stepId)) {
        errors.push(`step "${step.id}": references {{steps.${ref.stepId}.extract.${ref.varName}}} but no earlier step "${ref.stepId}"`);
      } else if (!declaredExtracts.get(ref.stepId)?.has(ref.varName)) {
        errors.push(`step "${step.id}": step "${ref.stepId}" does not extract "${ref.varName}"`);
      }
    }

    if (step.extract) {
      for (const [varName, path] of Object.entries(step.extract)) {
        if (!path.startsWith("$")) errors.push(`step "${step.id}": extract "${varName}" JSONPath must start with $`);
      }
      declaredExtracts.set(step.id, new Set(Object.keys(step.extract)));
    } else {
      declaredExtracts.set(step.id, new Set());
    }
  });

  if (writes && spec.cleanup.length === 0) {
    errors.push("spec writes data but has no cleanup entries");
  }
  return errors;
}

function stripFences(text: string): string {
  return text.replace(/^```(?:yaml|yml)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function normalizeSpecObject(obj: unknown, composition: Composition, specId: string): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  const o = { ...(obj as Record<string, unknown>) };
  o.version ??= 1;
  if (!o.specId || o.specId === "") o.specId = specId;
  o.compositionId ??= composition.compositionId;
  o.title ??= composition.goal;
  o.environment ??= composition.testDecision?.environments[0] ?? "staging";
  o.authProfile ??= "default";
  o.tags ??= [];
  o.cleanup ??= [];
  return o;
}

export interface GenerateOptions {
  llm: LlmComplete;
  model?: string;
  maxRepairs?: number;
  packId?: string | null;
}

export interface GenerateResult {
  specId: string;
  yaml: string;
  spec: TestSpec | null;
  valid: boolean;
  errors: string[];
  attempts: number;
}

export async function generateTestSpec(
  store: Store,
  compositionId: string,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const composition = store.compositions.get(compositionId);
  if (!composition) throw new Error(`composition ${compositionId} not found`);
  if (composition.status !== "approved") {
    throw new Error(`composition ${compositionId} is ${composition.status}; only approved compositions become tests`);
  }

  const validOperationIds = new Set(store.operations.list().map((o) => o.operationId));
  const operationMethods: Record<string, string> = {};
  for (const o of store.operations.list()) operationMethods[o.operationId] = o.method;

  const { system, user } = assembleContext(store, composition);
  const specId = newId();
  const maxRepairs = opts.maxRepairs ?? 1;

  let attempts = 0;
  let yaml = "";
  let spec: TestSpec | null = null;
  let errors: string[] = [];
  let prompt = user;

  while (attempts <= maxRepairs) {
    attempts += 1;
    yaml = stripFences(await opts.llm(system, prompt));
    try {
      const parsed = normalizeSpecObject(loadYaml(yaml), composition, specId);
      spec = TestSpecSchema.parse(parsed);
      errors = validateSpec(spec, { validOperationIds, operationMethods });
    } catch (e) {
      spec = null;
      errors = [`could not parse TestSpec: ${(e as Error).message}`];
    }
    if (errors.length === 0) break;
    prompt = `${user}\n\n## Previous attempt was INVALID. Fix these errors and re-emit the full YAML:\n${errors.map((e) => `- ${e}`).join("\n")}`;
  }

  const valid = errors.length === 0 && spec !== null;
  store.specs.upsert({
    specId,
    compositionId,
    yaml,
    generatedBy: "agent",
    model: opts.model ?? null,
    packId: opts.packId ?? null,
    createdAt: Date.now(),
    status: valid ? "generated" : "invalid",
  });

  return { specId, yaml, spec, valid, errors, attempts };
}

/**
 * Resolve the model routed to `task` into the plain text-in/text-out callable the generation and
 * composition code takes. All provider selection, credentials, timeouts and backoff live in
 * @backbencher/llm; this is only the adapter to `LlmComplete`.
 *
 * `modelName` overrides the route. When `llm.models` is configured it must name one of them; with
 * no `llm.models` it is passed through as a raw model id on the legacy single-model path.
 */
export function createLlm(cfg: BbConfig, task: LlmTask = "generateSpec", modelName?: string): LlmComplete {
  const effective = modelName ? withModelOverride(cfg, task, modelName) : cfg;
  const provider = createLlmRegistry(effective).forTask(task);
  return (system, user) => provider.complete({ system, user });
}

function withModelOverride(cfg: BbConfig, task: LlmTask, modelName: string): BbConfig {
  const configured = Object.keys(cfg.llm.models);
  if (configured.length === 0) {
    return { ...cfg, agent: { ...cfg.agent, model: modelName } };
  }
  if (!cfg.llm.models[modelName]) {
    throw new Error(`Unknown model "${modelName}". Configured models: ${configured.join(", ")}`);
  }
  return { ...cfg, llm: { ...cfg.llm, tasks: { ...cfg.llm.tasks, [task]: modelName } } };
}
