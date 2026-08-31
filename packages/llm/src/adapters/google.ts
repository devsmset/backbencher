import type { LlmModelConfig } from "@backbencher/shared";
import { LlmError, isRetryableStatus } from "../errors.js";
import { toGeminiSchema, toJsonSchema } from "../jsonSchema.js";
import type { CompleteJsonRequest, CompleteRequest, Provider, ProviderKind } from "../types.js";
import type { FetchLike } from "./openaiCompatible.js";

type ApiKeyCfg = Extract<LlmModelConfig, { provider: "google" }>;
type VertexCfg = Extract<LlmModelConfig, { provider: "google-vertex" }>;

/** Resolved per call: Vertex access tokens expire, so headers cannot be fixed at construction. */
type AuthHeaders = () => Promise<Record<string, string>>;

async function post(
  fetchImpl: FetchLike,
  url: string,
  auth: AuthHeaders,
  body: unknown,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await auth()) },
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

function generateBody(maxTokens: number, req: CompleteRequest, generationExtras: Record<string, unknown>) {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? maxTokens,
      ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
      ...generationExtras,
    },
  };
}

function firstText(payload: unknown): string {
  const candidate = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates?.[0];
  return candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

function checkCount(got: number, want: number): void {
  if (got !== want) throw new LlmError(`Embeddings endpoint returned ${got} vectors for ${want} inputs`);
}

interface GeminiTransport {
  readonly kind: ProviderKind;
  readonly model: string;
  readonly maxTokens: number;
  readonly generateUrl: string;
  readonly auth: AuthHeaders;
  embed(inputs: readonly string[], fetchImpl: FetchLike, auth: AuthHeaders): Promise<number[][]>;
}

/** Both Google surfaces speak the same generateContent body; only the URL and auth differ. */
function geminiProvider(t: GeminiTransport, fetchImpl: FetchLike): Provider {
  return {
    capabilities: {
      provider: t.kind,
      model: t.model,
      completion: true,
      structuredOutput: true,
      embeddings: true,
    },
    async complete(req) {
      return firstText(await post(fetchImpl, t.generateUrl, t.auth, generateBody(t.maxTokens, req, {}), req.signal));
    },
    async completeJson<T>(req: CompleteJsonRequest<T>): Promise<T> {
      const body = generateBody(t.maxTokens, req, {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(toJsonSchema(req.schema)),
      });
      return req.schema.parse(JSON.parse(firstText(await post(fetchImpl, t.generateUrl, t.auth, body, req.signal))));
    },
    embed: (inputs) => t.embed(inputs, fetchImpl, t.auth),
  };
}

/** Gemini and Gemma via the Generative Language API (AI Studio key). */
export function createGoogleProvider(cfg: ApiKeyCfg, fetchImpl: FetchLike = fetch): Provider {
  const apiKey = process.env[cfg.apiKeyEnv];
  if (!apiKey) throw new LlmError(`Google model "${cfg.model}" requires ${cfg.apiKeyEnv} to be set`);
  const base = `${cfg.baseUrl.replace(/\/+$/, "")}/v1beta/models/${cfg.model}`;
  const auth: AuthHeaders = () => Promise.resolve({ "x-goog-api-key": apiKey });

  return geminiProvider(
    {
      kind: "google",
      model: cfg.model,
      maxTokens: cfg.maxTokens,
      generateUrl: `${base}:generateContent`,
      auth,
      async embed(inputs, f, a) {
        const body = {
          requests: inputs.map((text) => ({ model: `models/${cfg.model}`, content: { parts: [{ text }] } })),
        };
        const payload = await post(f, `${base}:batchEmbedContents`, a, body, undefined);
        const embeddings = (payload as { embeddings?: Array<{ values?: number[] }> }).embeddings ?? [];
        checkCount(embeddings.length, inputs.length);
        return embeddings.map((e) => e.values ?? []);
      },
    },
    fetchImpl,
  );
}

export type TokenSource = () => Promise<string>;

function defaultTokenSource(credentialsFile: string | undefined): TokenSource {
  let auth: { getAccessToken(): Promise<string | null | undefined> } | undefined;
  return async () => {
    if (!auth) {
      const { GoogleAuth } = await import("google-auth-library");
      auth = new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        ...(credentialsFile ? { keyFile: credentialsFile } : {}),
      });
    }
    const token = await auth.getAccessToken();
    if (!token) throw new LlmError("Google Cloud returned no access token; check your credentials");
    return token;
  };
}

/**
 * Gemini on Vertex AI. Unlike the AI Studio API this is OAuth, not an API key: credentials come from
 * a service-account JSON or Application Default Credentials (`gcloud auth application-default login`).
 */
export function createGoogleVertexProvider(
  cfg: VertexCfg,
  fetchImpl: FetchLike = fetch,
  tokenSource?: TokenSource,
): Provider {
  const projectId = cfg.projectId ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new LlmError(`Google-Vertex model "${cfg.model}" requires a project id (projectId or GOOGLE_CLOUD_PROJECT)`);
  }
  const region = cfg.region;
  const host = region === "global" ? "aiplatform.googleapis.com" : `${region}-aiplatform.googleapis.com`;
  const base = `https://${host}/v1/projects/${projectId}/locations/${region}/publishers/google/models`;
  const getToken =
    tokenSource ?? defaultTokenSource(cfg.credentialsFile ?? process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const auth: AuthHeaders = async () => ({ authorization: `Bearer ${await getToken()}` });

  return geminiProvider(
    {
      kind: "google-vertex",
      model: cfg.model,
      maxTokens: cfg.maxTokens,
      generateUrl: `${base}/${cfg.model}:generateContent`,
      auth,
      async embed(inputs, f, a) {
        // Vertex embedding models use :predict with instances, not the generateContent surface.
        const body = {
          instances: inputs.map((content) => ({ content, ...(cfg.taskType ? { task_type: cfg.taskType } : {}) })),
        };
        const payload = await post(f, `${base}/${cfg.model}:predict`, a, body, undefined);
        const predictions =
          (payload as { predictions?: Array<{ embeddings?: { values?: number[] } }> }).predictions ?? [];
        checkCount(predictions.length, inputs.length);
        return predictions.map((p) => p.embeddings?.values ?? []);
      },
    },
    fetchImpl,
  );
}
