import { type RehearsalResult, RehearsalResultSchema } from "@backbencher/schemas";
import { newId } from "@backbencher/shared";
import type { Store } from "@backbencher/store";
import { type ComposeOptions, proposeScenario } from "./compose.js";

// Goal rehearsal (realignment guide §8). Runs held-out goals through the composer and records how
// each draft fared. `autoPass` only means the draft came out dependency-consistent with no gaps —
// which the deterministic validator already guarantees, so on its own it trends to 100% while the
// drafts are semantically wrong. The human verdict is the signal that actually tracks quality.

export interface RehearsalRunOptions extends Omit<ComposeOptions, "actor"> {
  actor: string;
  goalIds?: string[];
}

export interface RehearsalSummary {
  results: RehearsalResult[];
  autoPassRate: number;
  /** Of the results a human has judged, the share judged good. Null when nothing is judged yet. */
  humanGoodRate: number | null;
  unjudged: number;
}

export async function runRehearsal(store: Store, opts: RehearsalRunOptions): Promise<RehearsalSummary> {
  const all = store.rehearsal.listGoals();
  const goals = opts.goalIds ? all.filter((g) => opts.goalIds?.includes(g.goalId)) : all;

  const results: RehearsalResult[] = [];
  for (const goal of goals) {
    const { composition } = await proposeScenario(store, goal.goal, opts);
    const unmetCount = composition.unmetDependencies.length;
    const gapCount = composition.candidateGaps.length;
    results.push(
      store.rehearsal.upsertResult(
        RehearsalResultSchema.parse({
          resultId: newId(),
          goalId: goal.goalId,
          compositionId: composition.compositionId,
          unmetCount,
          gapCount,
          stepCount: composition.steps.length,
          autoPass: unmetCount === 0 && gapCount === 0 && composition.steps.length > 0,
          humanVerdict: "unjudged",
          ranBy: opts.actor,
          ranAt: Date.now(),
        }),
      ),
    );
  }

  return summarize(results);
}

export function summarize(results: readonly RehearsalResult[]): RehearsalSummary {
  const judged = results.filter((r) => r.humanVerdict !== "unjudged");
  const good = judged.filter((r) => r.humanVerdict === "good");
  return {
    results: [...results],
    autoPassRate: results.length === 0 ? 0 : results.filter((r) => r.autoPass).length / results.length,
    humanGoodRate: judged.length === 0 ? null : good.length / judged.length,
    unjudged: results.length - judged.length,
  };
}

/** The latest result per goal — what the dashboard should show, not the whole history. */
export function latestResults(store: Store): RehearsalResult[] {
  const latest = new Map<string, RehearsalResult>();
  for (const r of store.rehearsal.listResults()) {
    const prior = latest.get(r.goalId);
    if (!prior || r.ranAt > prior.ranAt) latest.set(r.goalId, r);
  }
  return [...latest.values()];
}
