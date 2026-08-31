import type { LlmModelConfig } from "@backbencher/shared";
import { LlmCapabilityError, LlmError, isRetryableStatus } from "../errors.js";
import { toJsonSchema } from "../jsonSchema.js";
import type { Capabilities, CompleteJsonRequest, CompleteRequest, Provider } from "../types.js";

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
}

interface MessagesClient {
  messages: {
    create(
      body: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ): Promise<{ content: ContentBlock[] }>;
  };
}

function wrapError(err: unknown): never {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === "number") {
    throw new LlmError(`Anthropic request failed with status ${status}`, {
      status,
      retryable: isRetryableStatus(status),
      cause: err,
    });
  }
  throw err;
}

function textOf(content: ContentBlock[]): string {
  return content.find((b) => b.type === "text")?.text ?? "";
}

function baseBody(cfg: { model: string; maxTokens: number }, req: CompleteRequest): Record<string, unknown> {
  return {
    model: cfg.model,
    max_tokens: req.maxTokens ?? cfg.maxTokens,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
    ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
  };
}

/**
 * Shared implementation for Anthropic direct and Anthropic-on-Vertex — same wire protocol, only the
 * client construction differs. Constrained JSON is done with a single forced tool call.
 */
function anthropicProvider(
  capabilities: Capabilities,
  cfg: { model: string; maxTokens: number },
  getClient: () => Promise<MessagesClient>,
): Provider {
  return {
    capabilities,
    async complete(req) {
      const client = await getClient();
      try {
        const res = await client.messages.create(baseBody(cfg, req), signalOpt(req.signal));
        return textOf(res.content);
      } catch (err) {
        return wrapError(err);
      }
    },
    async completeJson<T>(req: CompleteJsonRequest<T>): Promise<T> {
      const client = await getClient();
      const name = req.schemaName ?? "result";
      const body = {
        ...baseBody(cfg, req),
        tools: [{ name, description: `Return the ${name}.`, input_schema: toJsonSchema(req.schema) }],
        tool_choice: { type: "tool", name },
      };
      try {
        const res = await client.messages.create(body, signalOpt(req.signal));
        const block = res.content.find((b) => b.type === "tool_use");
        if (!block) throw new LlmError("Model returned no tool call for a constrained-JSON request");
        return req.schema.parse(block.input);
      } catch (err) {
        if (err instanceof LlmError) throw err;
        return wrapError(err);
      }
    },
    embed() {
      return Promise.reject(
        new LlmCapabilityError(
          `Model "${cfg.model}" cannot embed: Anthropic has no embeddings API. Route the "embed" task to a google or openai-compatible model.`,
        ),
      );
    },
  };
}

function signalOpt(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal ? { signal } : {};
}

export function createAnthropicProvider(cfg: Extract<LlmModelConfig, { provider: "anthropic" }>): Provider {
  const apiKey = process.env[cfg.apiKeyEnv];
  if (!apiKey) throw new LlmError(`Anthropic model "${cfg.model}" requires ${cfg.apiKeyEnv} to be set`);
  return anthropicProvider(
    { provider: "anthropic", model: cfg.model, completion: true, structuredOutput: true, embeddings: false },
    cfg,
    async () => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      return new Anthropic({ apiKey }) as unknown as MessagesClient;
    },
  );
}

/** Anthropic on Google Cloud Vertex AI: service-account JSON, or Application Default Credentials. */
export function createAnthropicVertexProvider(
  cfg: Extract<LlmModelConfig, { provider: "anthropic-vertex" }>,
): Provider {
  const projectId =
    cfg.projectId ?? process.env.ANTHROPIC_VERTEX_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new LlmError(
      `Anthropic-Vertex model "${cfg.model}" requires a project id (projectId, ANTHROPIC_VERTEX_PROJECT_ID or GOOGLE_CLOUD_PROJECT)`,
    );
  }
  const region =
    cfg.region ?? process.env.CLOUD_ML_REGION ?? process.env.ANTHROPIC_VERTEX_REGION ?? "us-east5";
  const credentialsFile = cfg.credentialsFile ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;

  return anthropicProvider(
    {
      provider: "anthropic-vertex",
      model: cfg.model,
      completion: true,
      structuredOutput: true,
      embeddings: false,
    },
    cfg,
    async () => {
      const { AnthropicVertex } = await import("@anthropic-ai/vertex-sdk");
      const options: Record<string, unknown> = { projectId, region };
      if (credentialsFile) {
        const { GoogleAuth } = await import("google-auth-library");
        options.googleAuth = new GoogleAuth({
          keyFile: credentialsFile,
          scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });
      }
      const Ctor = AnthropicVertex as unknown as new (o: Record<string, unknown>) => MessagesClient;
      return new Ctor(options);
    },
  );
}
