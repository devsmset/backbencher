import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FetchLike } from "../src/adapters/openaiCompatible.js";
import { createOpenAiCompatibleProvider } from "../src/adapters/openaiCompatible.js";

const cfg = {
  provider: "openai-compatible" as const,
  model: "gemma3:12b",
  baseUrl: "http://localhost:11434/v1/",
  maxTokens: 2048,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function chatReply(content: string): unknown {
  return { choices: [{ message: { role: "assistant", content } }] };
}

describe("openai-compatible adapter", () => {
  it("posts a system+user chat completion and returns the message text", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse(chatReply("hello")))) as unknown as FetchLike;
    const provider = createOpenAiCompatibleProvider(cfg, fetchImpl);

    await expect(provider.complete({ system: "sys", user: "usr" })).resolves.toBe("hello");

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gemma3:12b");
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
  });

  it("requests a json_schema response format and validates the reply", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse(chatReply('{"answer":"yes"}'))),
    ) as unknown as FetchLike;
    const provider = createOpenAiCompatibleProvider(cfg, fetchImpl);

    const result = await provider.completeJson({
      system: "sys",
      user: "usr",
      schema: z.object({ answer: z.string() }),
      schemaName: "verdict",
    });

    expect(result).toEqual({ answer: "yes" });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.name).toBe("verdict");
  });

  it("falls back to plain JSON mode when the server rejects json_schema", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "unsupported response_format" }, 400))
      .mockResolvedValueOnce(jsonResponse(chatReply('```json\n{"answer":"maybe"}\n```'))) as unknown as FetchLike;
    const provider = createOpenAiCompatibleProvider(cfg, fetchImpl);

    const result = await provider.completeJson({
      system: "sys",
      user: "usr",
      schema: z.object({ answer: z.string() }),
    });

    expect(result).toEqual({ answer: "maybe" });
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse((calls[1]?.[1] as RequestInit).body as string).response_format).toEqual({
      type: "json_object",
    });
  });

  it("surfaces a retryable error for 5xx responses", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse({ error: "overloaded" }, 503)),
    ) as unknown as FetchLike;
    const provider = createOpenAiCompatibleProvider(cfg, fetchImpl);

    await expect(provider.complete({ system: "s", user: "u" })).rejects.toMatchObject({
      status: 503,
      retryable: true,
    });
  });

  it("returns embeddings in input order regardless of response order", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          data: [
            { index: 1, embedding: [0.3, 0.4] },
            { index: 0, embedding: [0.1, 0.2] },
          ],
        }),
      ),
    ) as unknown as FetchLike;
    const provider = createOpenAiCompatibleProvider(cfg, fetchImpl);

    await expect(provider.embed(["first", "second"])).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it("rejects when the embeddings endpoint returns the wrong number of vectors", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse({ data: [{ index: 0, embedding: [1] }] })),
    ) as unknown as FetchLike;
    const provider = createOpenAiCompatibleProvider(cfg, fetchImpl);

    await expect(provider.embed(["a", "b"])).rejects.toThrow(/1 vectors for 2 inputs/);
  });
});
