import { BbConfigSchema } from "@backbencher/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../src/adapters/openaiCompatible.js";
import { LlmCapabilityError } from "../src/errors.js";
import { createLlmRegistry } from "../src/registry.js";

const local = {
  provider: "openai-compatible",
  model: "gemma3:12b",
  baseUrl: "http://localhost:11434/v1",
};
const embedder = {
  provider: "openai-compatible",
  model: "nomic-embed-text",
  baseUrl: "http://localhost:11434/v1",
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("createLlmRegistry", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("routes every task to the default model when only one is configured", () => {
    const cfg = BbConfigSchema.parse({ llm: { models: { solo: local }, tasks: { default: "solo" } } });
    const registry = createLlmRegistry(cfg);

    for (const task of ["compose", "generateSpec", "suggestAnnotation", "stepIntents", "embed"] as const) {
      expect(registry.modelNameForTask(task)).toBe("solo");
      expect(registry.forTask(task).capabilities.model).toBe("gemma3:12b");
    }
  });

  it("routes individual tasks to their own model, falling back to default", () => {
    const cfg = BbConfigSchema.parse({
      llm: {
        models: { big: { provider: "anthropic", model: "claude-sonnet-4-5" }, small: local, vectors: embedder },
        tasks: { default: "big", suggestAnnotation: "small", embed: "vectors" },
      },
    });
    const registry = createLlmRegistry(cfg);

    expect(registry.forTask("compose").capabilities.model).toBe("claude-sonnet-4-5");
    expect(registry.forTask("suggestAnnotation").capabilities.model).toBe("gemma3:12b");
    expect(registry.forTask("embed").capabilities.model).toBe("nomic-embed-text");
  });

  it("names the missing model when a task routes nowhere", () => {
    const cfg = BbConfigSchema.parse({ llm: { models: { solo: local }, tasks: { default: "typo" } } });
    expect(() => createLlmRegistry(cfg).forTask("compose")).toThrow(/routes to model "typo"/);
  });

  it("refuses to embed with a model that has no embeddings API", async () => {
    const cfg = BbConfigSchema.parse({
      llm: { models: { big: { provider: "anthropic", model: "claude-sonnet-4-5" } }, tasks: { default: "big" } },
    });
    await expect(createLlmRegistry(cfg).forTask("embed").embed(["x"])).rejects.toBeInstanceOf(LlmCapabilityError);
  });

  it("falls back to the legacy agent config when no models are declared", () => {
    const cfg = BbConfigSchema.parse({ agent: { provider: "anthropic", model: "claude-legacy" } });
    expect(createLlmRegistry(cfg).forTask("compose").capabilities).toMatchObject({
      provider: "anthropic",
      model: "claude-legacy",
    });
  });

  it("maps the legacy vertex provider onto the anthropic-vertex adapter", () => {
    const cfg = BbConfigSchema.parse({
      agent: { provider: "vertex", model: "claude-on-vertex", vertex: { projectId: "p", region: "r" } },
    });
    expect(createLlmRegistry(cfg).forTask("compose").capabilities.provider).toBe("anthropic-vertex");
  });

  it("retries a retryable failure through the resilience wrapper", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("overloaded", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "ok" } }] })) as unknown as FetchLike;
    const cfg = BbConfigSchema.parse({
      llm: { models: { solo: local }, tasks: { default: "solo" }, maxRetries: 2 },
    });

    const provider = createLlmRegistry(cfg, { fetchImpl }).forTask("compose");
    await expect(provider.complete({ system: "s", user: "u" })).resolves.toBe("ok");
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("reuses one provider instance per model name", () => {
    const cfg = BbConfigSchema.parse({
      llm: { models: { solo: local }, tasks: { default: "solo", embed: "solo" } },
    });
    const registry = createLlmRegistry(cfg);
    expect(registry.forTask("compose")).toBe(registry.forTask("embed"));
  });
});
