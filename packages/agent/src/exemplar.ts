import { type Exemplar, ExemplarSchema } from "@backbencher/schemas";
import { newId } from "@backbencher/shared";
import { type Store, mergeOperation } from "@backbencher/store";
import { z } from "zod";
import type { LlmComplete } from "./generate.js";

// Promoting a Session into an Exemplar (realignment guide §3.1, ADR-0002). The analyst's name and
// goal come from the recording itself — a model cannot recover "I was testing the bulk-import edge
// case" from a call list. What a model CAN do is write the per-step intents, which is all it does
// here. The analyst edits the result before it is saved.

const StepIntentsSchema = z.object({
  steps: z.array(z.object({ order: z.number().int(), intent: z.string() })),
});

const SYSTEM = `You label the steps of a recorded API session.
You are given the analyst's goal for the session and the ordered list of API operations they hit.
For each step, write ONE short line saying what that step accomplishes in the goal's terms
("Log in as the admin user", "Fetch the ticket that was just created").
Rules:
- Do not invent steps, drop steps, or reorder them. Return exactly one intent per input step.
- Describe purpose, not mechanics. Never restate the HTTP method and path.
- Return JSON only.`;

export interface DraftExemplarOptions {
  llm?: LlmComplete;
  actor: string;
}

export interface DraftExemplarResult {
  exemplar: Exemplar;
  intentsDrafted: boolean;
}

/**
 * Build an Exemplar draft from a recorded session's observed flow. Not persisted — the analyst
 * reviews and edits the intents first.
 */
export async function draftExemplarFromSession(
  store: Store,
  sessionId: string,
  opts: DraftExemplarOptions,
): Promise<DraftExemplarResult> {
  const session = store.sessions.get(sessionId);
  if (!session) throw new Error(`no session ${sessionId}`);
  const { name, goal } = session.meta;

  const flows = store.flows.listBySession(sessionId);
  const steps = flows.flatMap((f) => f.steps).map((s) => ({ operationId: s.operationId, intent: "" }));
  if (steps.length === 0) {
    throw new Error(`session ${sessionId} has no derived flow — run \`bb derive\` first`);
  }

  const existing = store.exemplars.getBySession(sessionId);
  const base = {
    exemplarId: existing?.exemplarId ?? newId(),
    sessionId,
    name,
    goal,
    steps,
    sourceFlowIds: flows.map((f) => f.flowId),
    updatedBy: opts.actor,
    updatedAt: Date.now(),
  };

  if (!opts.llm) return { exemplar: ExemplarSchema.parse(base), intentsDrafted: false };

  const catalog = new Map(store.annotations.list().map((a) => [a.operationId, a]));
  const described = steps.map((s, i) => {
    const op = store.operations.get(s.operationId);
    const merged = op ? mergeOperation(op, catalog.get(s.operationId) ?? null) : null;
    const label = merged?.name ?? `${merged?.method ?? "?"} ${merged?.pathTemplate.template ?? s.operationId}`;
    return `${i + 1}. ${label}${merged?.does ? ` — ${merged.does}` : ""}`;
  });

  const user = [
    `SESSION NAME: ${name}`,
    `GOAL: ${goal}`,
    "STEPS:",
    ...described,
    "",
    `Return JSON: {"steps":[{"order":1,"intent":"..."}, ...]} with exactly ${steps.length} entries.`,
  ].join("\n");

  let intents: string[] = [];
  try {
    const raw = await opts.llm(SYSTEM, user);
    const parsed = StepIntentsSchema.parse(JSON.parse(raw.replace(/^\s*```(?:json)?|```\s*$/g, "").trim()));
    intents = [...parsed.steps].sort((a, b) => a.order - b.order).map((s) => s.intent);
  } catch {
    // A failed draft is not a failed promotion: hand back empty intents for the analyst to fill in.
    return { exemplar: ExemplarSchema.parse(base), intentsDrafted: false };
  }

  const drafted = intents.length === steps.length;
  return {
    exemplar: ExemplarSchema.parse({
      ...base,
      steps: steps.map((s, i) => ({ ...s, intent: drafted ? (intents[i] ?? "") : "" })),
    }),
    intentsDrafted: drafted,
  };
}
