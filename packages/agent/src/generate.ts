import { type Scenario, type TestSpec, TestSpecSchema } from "@backbencher/schemas";
import { type AgentConfig, newId } from "@backbencher/shared";
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
      const merged = mergeOperation(o, store.annotations.get(o.operationId));
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
      return "Generate a happy-path functional flow following the scenario steps, chaining ids via {{steps.*.extract.*}} and cleaning up any created resources.";
    default:
      return "";
  }
}

export function assembleContext(store: Store, scenario: Scenario): { system: string; user: string } {
  const stepOpIds = new Set(scenario.steps.map((s) => s.operationId));

  // full merged detail for the scenario's operations + their 1-hop dataflow neighbors
  const detailIds = new Set(stepOpIds);
  const edges = store.dataflow.all().filter((e) => stepOpIds.has(e.producer.operationId) || stepOpIds.has(e.consumer.operationId));
  for (const e of edges) {
    detailIds.add(e.producer.operationId);
    detailIds.add(e.consumer.operationId);
  }
  const details = [...detailIds]
    .map((id) => {
      const op = store.operations.get(id);
      return op ? mergeOperation(op, store.annotations.get(id)) : null;
    })
    .filter((o) => o !== null);

  const guides = store.guides
    .list()
    .filter((g) => g.priority === "must_read" && (g.scope.operationIds.some((id) => stepOpIds.has(id)) || g.scope.productArea));

  const user = [
    "## Catalog",
    compactCatalog(store),
    "",
    "## Must-read guides",
    guides.map((g) => `### ${g.title}\n${g.body}`).join("\n\n") || "(none)",
    "",
    "## Scenario",
    JSON.stringify(scenario, null, 2),
    "",
    "## Operation details (scenario ops + 1-hop dataflow neighbors)",
    JSON.stringify(details, null, 2),
    "",
    "## Dataflow edges among these operations",
    JSON.stringify(edges, null, 2),
    "",
    `## Task: emit a TestSpec YAML for strategy=${scenario.testDecision.strategy}.`,
    `## Strategy guidance (${scenario.testDecision.strategy})`,
    strategyGuidance(scenario.testDecision.strategy),
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

function normalizeSpecObject(obj: unknown, scenario: Scenario, specId: string): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  const o = { ...(obj as Record<string, unknown>) };
  o.version ??= 1;
  if (!o.specId || o.specId === "") o.specId = specId;
  o.scenarioId ??= scenario.scenarioId;
  o.title ??= scenario.name;
  o.environment ??= scenario.testDecision.environments[0] ?? "staging";
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
  scenarioId: string,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const scenario = store.scenarios.get(scenarioId);
  if (!scenario) throw new Error(`scenario ${scenarioId} not found`);

  const validOperationIds = new Set(store.operations.list().map((o) => o.operationId));
  const operationMethods: Record<string, string> = {};
  for (const o of store.operations.list()) operationMethods[o.operationId] = o.method;

  const { system, user } = assembleContext(store, scenario);
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
      const parsed = normalizeSpecObject(loadYaml(yaml), scenario, specId);
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
    scenarioId,
    yaml,
    generatedBy: "agent",
    model: opts.model ?? null,
    packId: opts.packId ?? null,
    createdAt: Date.now(),
    status: valid ? "generated" : "invalid",
  });

  return { specId, yaml, spec, valid, errors, attempts };
}

export function createAnthropicLlm(opts: { apiKey: string; model?: string }): LlmComplete {
  return async (system, user) => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: opts.apiKey });
    const res = await client.messages.create({
      model: opts.model ?? "claude-3-5-sonnet-latest",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : "";
  };
}

/** Anthropic on Google Cloud Vertex AI. Auth via a service-account JSON (credentialsFile) or
 * Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS / gcloud). */
export function createVertexLlm(opts: {
  projectId: string;
  region: string;
  model?: string;
  credentialsFile?: string;
}): LlmComplete {
  return async (system, user) => {
    const { AnthropicVertex } = await import("@anthropic-ai/vertex-sdk");
    const options: Record<string, unknown> = { projectId: opts.projectId, region: opts.region };
    if (opts.credentialsFile) {
      const { GoogleAuth } = await import("google-auth-library");
      options.googleAuth = new GoogleAuth({
        keyFile: opts.credentialsFile,
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
    }
    const client = new AnthropicVertex(
      options as unknown as ConstructorParameters<typeof AnthropicVertex>[0],
    );
    const res = await client.messages.create({
      model: opts.model ?? "claude-3-5-sonnet-v2@20241022",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    });
    const blocks = res.content as Array<{ type: string; text?: string }>;
    const block = blocks.find((b) => b.type === "text");
    return block?.text ?? "";
  };
}

/**
 * Build an LlmComplete from agent config, selecting the provider and resolving credentials from
 * config or environment. Throws a clear error if required credentials are missing.
 */
export function createLlm(cfg: AgentConfig): LlmComplete {
  const model = cfg.model ?? process.env.BB_LLM_MODEL;
  if (cfg.provider === "vertex") {
    const projectId =
      cfg.vertex.projectId ?? process.env.ANTHROPIC_VERTEX_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
    const region =
      cfg.vertex.region ?? process.env.CLOUD_ML_REGION ?? process.env.ANTHROPIC_VERTEX_REGION ?? "us-east5";
    const credentialsFile = cfg.vertex.credentialsFile ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!projectId) {
      throw new Error(
        "Vertex provider requires a project id (agent.vertex.projectId or ANTHROPIC_VERTEX_PROJECT_ID)",
      );
    }
    return createVertexLlm({
      projectId,
      region,
      ...(model ? { model } : {}),
      ...(credentialsFile ? { credentialsFile } : {}),
    });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic provider requires ANTHROPIC_API_KEY (or set agent.provider to "vertex")');
  }
  return createAnthropicLlm({ apiKey, ...(model ? { model } : {}) });
}
