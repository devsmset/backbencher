import type { z } from "zod";

export type ProviderKind =
  | "anthropic"
  | "anthropic-vertex"
  | "google"
  | "google-vertex"
  | "openai-compatible";

/** The set of jobs Backbencher asks a model to do. Each is independently routable to a model. */
export type LlmTask = "compose" | "generateSpec" | "suggestAnnotation" | "stepIntents" | "embed";

export interface Capabilities {
  readonly provider: ProviderKind;
  readonly model: string;
  readonly completion: boolean;
  /** Provider-native constrained JSON (tool use / responseSchema / json_schema response format). */
  readonly structuredOutput: boolean;
  readonly embeddings: boolean;
}

export interface CompleteRequest {
  readonly system: string;
  readonly user: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly signal?: AbortSignal;
}

export interface CompleteJsonRequest<T> extends CompleteRequest {
  readonly schema: z.ZodType<T>;
  /** Names the tool/schema presented to the model; some providers surface it in their prompt. */
  readonly schemaName?: string;
}

/**
 * A model, ready to call. Every method is stateless: no conversation is carried between calls.
 * Adapters may build multi-turn message arrays internally (Anthropic tool use does), but that
 * state never crosses this interface — see docs/adr/0001-llm-adapter-layer.md.
 */
export interface Provider {
  readonly capabilities: Capabilities;
  complete(req: CompleteRequest): Promise<string>;
  completeJson<T>(req: CompleteJsonRequest<T>): Promise<T>;
  embed(inputs: readonly string[]): Promise<number[][]>;
}
