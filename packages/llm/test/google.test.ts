import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FetchLike } from "../src/adapters/openaiCompatible.js";
import { createGoogleProvider, createGoogleVertexProvider } from "../src/adapters/google.js";

const cfg = {
  provider: "google" as const,
  model: "gemini-2.0-flash",
  apiKeyEnv: "TEST_GOOGLE_KEY",
  baseUrl: "https://generativelanguage.googleapis.com",
  maxTokens: 2048,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function candidate(text: string): unknown {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

describe("google adapter", () => {
  beforeEach(() => {
    process.env.TEST_GOOGLE_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.TEST_GOOGLE_KEY;
  });

  it("refuses to construct without its API key", () => {
    delete process.env.TEST_GOOGLE_KEY;
    expect(() => createGoogleProvider(cfg)).toThrow(/TEST_GOOGLE_KEY/);
  });

  it("sends the system prompt as systemInstruction", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse(candidate("hi")))) as unknown as FetchLike;
    const provider = createGoogleProvider(cfg, fetchImpl);

    await expect(provider.complete({ system: "sys", user: "usr" })).resolves.toBe("hi");

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1beta/models/gemini-2.0-flash:generateContent");
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.contents[0].parts[0].text).toBe("usr");
  });

  it("constrains JSON with a sanitized responseSchema", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse(candidate('{"answer":"yes"}'))),
    ) as unknown as FetchLike;
    const provider = createGoogleProvider(cfg, fetchImpl);

    await expect(
      provider.completeJson({ system: "s", user: "u", schema: z.object({ answer: z.string() }) }),
    ).resolves.toEqual({ answer: "yes" });

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(JSON.stringify(body.generationConfig.responseSchema)).not.toContain("additionalProperties");
  });

  it("returns batch embeddings in order", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse({ embeddings: [{ values: [1, 2] }, { values: [3, 4] }] })),
    ) as unknown as FetchLike;
    const provider = createGoogleProvider(cfg, fetchImpl);

    await expect(provider.embed(["a", "b"])).resolves.toEqual([
      [1, 2],
      [3, 4],
    ]);
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain(":batchEmbedContents");
  });
});

const vertexCfg = {
  provider: "google-vertex" as const,
  model: "gemini-2.5-pro",
  projectId: "my-project",
  region: "us-central1",
  maxTokens: 2048,
};

describe("google-vertex adapter", () => {
  const token = () => Promise.resolve("ya29.test-token");

  it("refuses to construct without a project id", () => {
    const saved = process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    const { projectId: _omit, ...noProject } = vertexCfg;
    expect(() => createGoogleVertexProvider(noProject as typeof vertexCfg)).toThrow(/project id/i);
    if (saved !== undefined) process.env.GOOGLE_CLOUD_PROJECT = saved;
  });

  it("calls the regional publisher endpoint with a bearer token", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse(candidate("hi")))) as unknown as FetchLike;
    const provider = createGoogleVertexProvider(vertexCfg, fetchImpl, token);

    await expect(provider.complete({ system: "sys", user: "usr" })).resolves.toBe("hi");

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent",
    );
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ya29.test-token");
  });

  it("uses the global host when the region is global", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse(candidate("hi")))) as unknown as FetchLike;
    const provider = createGoogleVertexProvider({ ...vertexCfg, region: "global" }, fetchImpl, token);

    await provider.complete({ system: "s", user: "u" });
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain("https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/");
  });

  it("embeds via :predict instances and unwraps predictions", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({ predictions: [{ embeddings: { values: [1, 2] } }, { embeddings: { values: [3, 4] } }] }),
      ),
    ) as unknown as FetchLike;
    const provider = createGoogleVertexProvider(
      { ...vertexCfg, model: "text-embedding-005", taskType: "RETRIEVAL_DOCUMENT" },
      fetchImpl,
      token,
    );

    await expect(provider.embed(["a", "b"])).resolves.toEqual([
      [1, 2],
      [3, 4],
    ]);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("text-embedding-005:predict");
    expect(JSON.parse(init.body as string).instances).toEqual([
      { content: "a", task_type: "RETRIEVAL_DOCUMENT" },
      { content: "b", task_type: "RETRIEVAL_DOCUMENT" },
    ]);
  });

  it("constrains JSON with responseSchema on Vertex too", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse(candidate('{"answer":"yes"}'))),
    ) as unknown as FetchLike;
    const provider = createGoogleVertexProvider(vertexCfg, fetchImpl, token);

    await expect(
      provider.completeJson({ system: "s", user: "u", schema: z.object({ answer: z.string() }) }),
    ).resolves.toEqual({ answer: "yes" });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).generationConfig.responseMimeType).toBe("application/json");
  });
});
