import type { LlmModelConfig } from "@backbencher/shared";
import { LlmError, isRetryableStatus } from "../errors.js";
import { parseJsonLoose, toJsonSchema } from "../jsonSchema.js";
import type { CompleteJsonRequest, CompleteRequest, Provider } from "../types.js";

export type FetchLike = typeof fetch;

type Cfg = Extract<LlmModelConfig, { provider: "openai-compatible" }>;

async function post(
  fetchImpl: FetchLike,
  url: string,
  apiKey: string | undefined,
  body: unknown,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    throw new LlmError(`${url} failed with status ${res.status}: ${(await res.text()).slice(0, 300)}`, {
      status: res.status,
      retryable: isRetryableStatus(res.status),
    });
  }
  return res.json();
}

function chatBody(cfg: Cfg, req: CompleteRequest): Record<string, unknown> {
  return {
    model: cfg.model,
    max_tokens: req.maxTokens ?? cfg.maxTokens,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
  };
}

function firstMessage(payload: unknown): string {
  const choice = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0];
  const content = choice?.message?.content;
  return typeof content === "string" ? content : "";
}

/**
 * The OpenAI chat-completions wire format, which Ollama, vLLM, LM Studio, LiteLLM and OpenAI all
 * speak. This is the whole local-model story — point `baseUrl` at the server.
 */
export function createOpenAiCompatibleProvider(cfg: Cfg, fetchImpl: FetchLike = fetch): Provider {
  const apiKey = cfg.apiKeyEnv ? process.env[cfg.apiKeyEnv] : undefined;
  const base = cfg.baseUrl.replace(/\/+$/, "");

  return {
    capabilities: {
      provider: "openai-compatible",
      model: cfg.model,
      completion: true,
      structuredOutput: true,
      embeddings: true,
    },
    async complete(req) {
      const payload = await post(fetchImpl, `${base}/chat/completions`, apiKey, chatBody(cfg, req), req.signal);
      return firstMessage(payload);
    },
    async completeJson<T>(req: CompleteJsonRequest<T>): Promise<T> {
      const name = req.schemaName ?? "result";
      const schema = toJsonSchema(req.schema);
      const url = `${base}/chat/completions`;
      let payload: unknown;
      try {
        payload = await post(
          fetchImpl,
          url,
          apiKey,
          {
            ...chatBody(cfg, req),
            response_format: { type: "json_schema", json_schema: { name, schema, strict: true } },
          },
          req.signal,
        );
      } catch (err) {
        // Older/leaner servers reject json_schema but still honour plain JSON mode.
        if (!(err instanceof LlmError) || err.status !== 400) throw err;
        payload = await post(
          fetchImpl,
          url,
          apiKey,
          { ...chatBody(cfg, req), response_format: { type: "json_object" } },
          req.signal,
        );
      }
      return req.schema.parse(parseJsonLoose(firstMessage(payload)));
    },
    async embed(inputs) {
      const payload = await post(
        fetchImpl,
        `${base}/embeddings`,
        apiKey,
        { model: cfg.model, input: [...inputs] },
        undefined,
      );
      const data = (payload as { data?: Array<{ index?: number; embedding?: number[] }> }).data ?? [];
      const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      if (ordered.length !== inputs.length) {
        throw new LlmError(`Embeddings endpoint returned ${ordered.length} vectors for ${inputs.length} inputs`);
      }
      return ordered.map((d) => d.embedding ?? []);
    },
  };
}
