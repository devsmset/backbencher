import type { BbConfig, LlmConfig, LlmModelConfig } from "@backbencher/shared";
import { createAnthropicProvider, createAnthropicVertexProvider } from "./adapters/anthropic.js";
import { createGoogleProvider, createGoogleVertexProvider } from "./adapters/google.js";
import { type FetchLike, createOpenAiCompatibleProvider } from "./adapters/openaiCompatible.js";
import { LlmCapabilityError, LlmError } from "./errors.js";
import { withRetry } from "./retry.js";
import type { LlmTask, Provider } from "./types.js";

export interface RegistryOptions {
  readonly fetchImpl?: FetchLike;
}

export interface LlmRegistry {
  /** The model routed to `task`, ready to call, with timeout and backoff already applied. */
  forTask(task: LlmTask): Provider;
  modelNameForTask(task: LlmTask): string;
}

function createProvider(cfg: LlmModelConfig, opts: RegistryOptions): Provider {
  switch (cfg.provider) {
    case "anthropic":
      return createAnthropicProvider(cfg);
    case "anthropic-vertex":
      return createAnthropicVertexProvider(cfg);
    case "google":
      return opts.fetchImpl ? createGoogleProvider(cfg, opts.fetchImpl) : createGoogleProvider(cfg);
    case "google-vertex":
      return opts.fetchImpl ? createGoogleVertexProvider(cfg, opts.fetchImpl) : createGoogleVertexProvider(cfg);
    case "openai-compatible":
      return opts.fetchImpl
        ? createOpenAiCompatibleProvider(cfg, opts.fetchImpl)
        : createOpenAiCompatibleProvider(cfg);
  }
}

function withResilience(inner: Provider, llm: LlmConfig): Provider {
  const retry = { maxRetries: llm.maxRetries, timeoutMs: llm.timeoutMs };
  return {
    capabilities: inner.capabilities,
    complete: (req) => withRetry((signal) => inner.complete({ ...req, signal }), { ...retry, ...signalOpt(req.signal) }),
    completeJson: <T>(req: Parameters<Provider["completeJson"]>[0]) => {
      if (!inner.capabilities.structuredOutput) {
        return Promise.reject(
          new LlmCapabilityError(
            `Model "${inner.capabilities.model}" cannot produce constrained JSON; route this task to a model that can.`,
          ),
        );
      }
      return withRetry((signal) => inner.completeJson({ ...req, signal }), {
        ...retry,
        ...signalOpt(req.signal),
      }) as Promise<T>;
    },
    embed: (inputs) => {
      if (!inner.capabilities.embeddings) {
        return Promise.reject(
          new LlmCapabilityError(`Model "${inner.capabilities.model}" cannot embed; route the "embed" task elsewhere.`),
        );
      }
      return withRetry(() => inner.embed(inputs), retry);
    },
  };
}

function signalOpt(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal ? { signal } : {};
}

/**
 * Bridge for configs written before `llm.models` existed: the old `agent` block described exactly
 * one Anthropic model, so it becomes the `default` route.
 */
function modelsFromLegacyAgentConfig(cfg: BbConfig): Record<string, LlmModelConfig> {
  const model = cfg.agent.model ?? process.env.BB_LLM_MODEL;
  if (cfg.agent.provider === "vertex") {
    return {
      default: {
        provider: "anthropic-vertex",
        model: model ?? "claude-3-5-sonnet-v2@20241022",
        maxTokens: 4096,
        ...(cfg.agent.vertex.projectId ? { projectId: cfg.agent.vertex.projectId } : {}),
        ...(cfg.agent.vertex.region ? { region: cfg.agent.vertex.region } : {}),
        ...(cfg.agent.vertex.credentialsFile ? { credentialsFile: cfg.agent.vertex.credentialsFile } : {}),
      },
    };
  }
  return {
    default: {
      provider: "anthropic",
      model: model ?? "claude-3-5-sonnet-latest",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      maxTokens: 4096,
    },
  };
}

export function createLlmRegistry(cfg: BbConfig, opts: RegistryOptions = {}): LlmRegistry {
  const models =
    Object.keys(cfg.llm.models).length > 0 ? cfg.llm.models : modelsFromLegacyAgentConfig(cfg);
  const cache = new Map<string, Provider>();

  const modelNameForTask = (task: LlmTask): string => cfg.llm.tasks[task] ?? cfg.llm.tasks.default;

  return {
    modelNameForTask,
    forTask(task) {
      const name = modelNameForTask(task);
      const cached = cache.get(name);
      if (cached) return cached;
      const modelCfg = models[name];
      if (!modelCfg) {
        throw new LlmError(
          `Task "${task}" routes to model "${name}", which is not defined in llm.models (${Object.keys(models).join(", ") || "none"})`,
        );
      }
      const provider = withResilience(createProvider(modelCfg, opts), cfg.llm);
      cache.set(name, provider);
      return provider;
    },
  };
}
