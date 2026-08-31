import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { z } from "zod";

export const ApiFilterConfigSchema = z.object({
  hostAllowlist: z.array(z.string()).default([]),
  pathAllowPatterns: z.array(z.string()).default([]),
  resourceTypes: z.array(z.string()).default(["xhr", "fetch"]),
  dropContentTypes: z.array(z.string()).default([]),
  dropPathPatterns: z.array(z.string()).default([]),
  dropMethods: z.array(z.string()).default(["OPTIONS"]),
});
export type ApiFilterConfig = z.infer<typeof ApiFilterConfigSchema>;

export const RecorderConfigSchema = z.object({
  defaultUrl: z.string().url().nullable().default(null),
  tlsPermissive: z.boolean().default(false),
  apiFilter: ApiFilterConfigSchema.default({}),
  inputDebounceMs: z.number().int().nonnegative().default(1000),
  bodyCapBytes: z.number().int().positive().default(262144),
  blockServiceWorkers: z.boolean().default(true),
});
export type RecorderConfig = z.infer<typeof RecorderConfigSchema>;

export const RedactionConfigSchema = z.object({
  headerDenylist: z
    .array(z.string())
    .default(["authorization", "cookie", "set-cookie", "x-csrf-token", "proxy-authorization"]),
  queryParamDenylist: z
    .array(z.string())
    .default(["code", "token", "access_token", "id_token", "session", "apikey", "api_key"]),
  bodyFieldDenylist: z
    .array(z.string())
    .default(["password", "secret", "token", "apiKey", "clientSecret"]),
  placeholder: z.string().default("***REDACTED***"),
  keepAuthShape: z.boolean().default(true),
  uiRedactSelectors: z.array(z.string()).default([]),
});
export type RedactionConfig = z.infer<typeof RedactionConfigSchema>;

export const EnvironmentConfigSchema = z.object({
  name: z.string(),
  baseUrl: z.string().url(),
  destructive: z.boolean().default(false),
});
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

/** @deprecated Superseded by `llm.models` + `llm.tasks`; retained so existing configs keep working. */
export const AgentConfigSchema = z.object({
  provider: z.enum(["anthropic", "vertex"]).default("anthropic"),
  model: z.string().optional(),
  vertex: z
    .object({
      projectId: z.string().optional(),
      region: z.string().optional(),
      credentialsFile: z.string().optional(), // path to a GCP service-account JSON
    })
    .default({}),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * A named model an analyst can route tasks to. The provider kind selects the adapter in
 * `@backbencher/llm`; `openai-compatible` covers Ollama, vLLM, LM Studio, LiteLLM and OpenAI itself.
 * API keys are named, never inlined — the value is read from the environment at call time.
 */
export const LlmModelConfigSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("anthropic"),
    model: z.string(),
    apiKeyEnv: z.string().default("ANTHROPIC_API_KEY"),
    maxTokens: z.number().int().positive().default(4096),
  }),
  z.object({
    provider: z.literal("anthropic-vertex"),
    model: z.string(),
    projectId: z.string().optional(),
    region: z.string().optional(),
    credentialsFile: z.string().optional(),
    maxTokens: z.number().int().positive().default(4096),
  }),
  z.object({
    provider: z.literal("google"),
    model: z.string(),
    apiKeyEnv: z.string().default("GOOGLE_API_KEY"),
    baseUrl: z.string().default("https://generativelanguage.googleapis.com"),
    maxTokens: z.number().int().positive().default(4096),
  }),
  z.object({
    provider: z.literal("google-vertex"),
    model: z.string(),
    projectId: z.string().optional(),
    region: z.string().default("us-central1"),
    credentialsFile: z.string().optional(),
    /** Vertex embedding models accept a task type, e.g. RETRIEVAL_DOCUMENT or RETRIEVAL_QUERY. */
    taskType: z.string().optional(),
    maxTokens: z.number().int().positive().default(4096),
  }),
  z.object({
    provider: z.literal("openai-compatible"),
    model: z.string(),
    baseUrl: z.string(), // e.g. "http://localhost:11434/v1" for Ollama
    apiKeyEnv: z.string().optional(),
    maxTokens: z.number().int().positive().default(4096),
  }),
]);
export type LlmModelConfig = z.infer<typeof LlmModelConfigSchema>;

/**
 * Task -> model-name routing. Only `default` is required: assign every task the same model when
 * you have one, or split them when you have more (cheap local model for bulk annotation and
 * embeddings, stronger model for composition).
 */
export const LlmTasksSchema = z.object({
  default: z.string().default("default"),
  compose: z.string().optional(),
  generateSpec: z.string().optional(),
  suggestAnnotation: z.string().optional(),
  stepIntents: z.string().optional(),
  embed: z.string().optional(),
});
export type LlmTasks = z.infer<typeof LlmTasksSchema>;

export const LlmConfigSchema = z.object({
  models: z.record(LlmModelConfigSchema).default({}),
  tasks: LlmTasksSchema.default({}),
  timeoutMs: z.number().int().positive().default(120_000),
  maxRetries: z.number().int().nonnegative().default(3),
});
export type LlmConfig = z.infer<typeof LlmConfigSchema>;

export const BbConfigSchema = z.object({
  recorder: RecorderConfigSchema.default({}),
  redaction: RedactionConfigSchema.default({}),
  agent: AgentConfigSchema.default({}),
  llm: LlmConfigSchema.default({}),
  environments: z.array(EnvironmentConfigSchema).default([]),
});
export type BbConfig = z.infer<typeof BbConfigSchema>;

const CONFIG_FILENAME = "bb.config.jsonc";
const ROOT_MARKERS = ["pnpm-workspace.yaml", ".git"];

/** Walk up from `startDir` to locate the repository root (workspace file or .git). */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);
  for (;;) {
    if (ROOT_MARKERS.some((m) => existsSync(join(dir, m)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir);
    dir = parent;
  }
}

/** Walk up from `startDir` to locate bb.config.jsonc; null if none found. */
export function findConfigPath(startDir: string = process.cwd()): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Load and validate bb.config.jsonc. Returns fully-defaulted config if none exists. */
export function loadConfig(startDir: string = process.cwd()): BbConfig {
  const path = findConfigPath(startDir);
  if (!path) return BbConfigSchema.parse({});
  const raw = readFileSync(path, "utf8");
  const parsed = parseJsonc(raw) as unknown;
  return BbConfigSchema.parse(parsed ?? {});
}

/** Absolute path to the gitignored data root (`<repoRoot>/data`). */
export function dataDir(startDir: string = process.cwd()): string {
  return join(findRepoRoot(startDir), "data");
}
