import { useEffect, useState } from "react";
import { trpc } from "../trpc.js";
import { Chip, Field, Muted, Panel, QueryState } from "../ui.js";

// Composer screen (realignment guide §6/§9 Phase 6): a free-text goal in, a reviewable draft
// Composition out. The human never hand-picks the endpoint list — they approve (supplying the
// test decision, which ADR-0002 only sets at approval), edit intents, or reject. Approved drafts
// flow into the *unchanged* agent.generateTestSpec / testkit pipeline.

interface DraftStep {
  operationId: string;
  intent: string;
  satisfies: string[];
  autoAdded: boolean;
  fromSessionIds: string[];
}

interface Draft {
  compositionId: string;
  goal: string;
  status: string;
  rationale?: string;
  steps: DraftStep[];
  unmetDependencies: { operationId: string; slot: string; note: string }[];
  candidateGaps: { description: string; suggestedName?: string }[];
}

const STRATEGIES = ["api_functional", "api_negative", "authz", "contract_only", "skip"] as const;
const RISK_LEVELS = ["critical", "high", "medium", "low"] as const;

export function Compose() {
  const utils = trpc.useUtils();
  const draftsQ = trpc.compose.drafts.useQuery();
  const propose = trpc.compose.propose.useMutation();
  const approve = trpc.compose.approve.useMutation();
  const reject = trpc.compose.reject.useMutation();
  const generate = trpc.agent.generate.useMutation();

  const [goal, setGoal] = useState("");
  const [active, setActive] = useState<Draft | null>(null);
  const [status, setStatus] = useState("");
  const [strategy, setStrategy] = useState<(typeof STRATEGIES)[number]>("api_functional");
  const [riskLevel, setRiskLevel] = useState<(typeof RISK_LEVELS)[number]>("medium");
  const [rationale, setRationale] = useState("");
  const [environments, setEnvironments] = useState("");

  const doPropose = () => {
    if (!goal.trim()) return;
    setStatus("");
    propose.mutate(
      { goal },
      {
        onSuccess: (res) => {
          setActive(res.composition as Draft);
          void utils.compose.drafts.invalidate();
        },
      },
    );
  };

  const updateIntent = (operationId: string, intent: string) => {
    if (!active) return;
    setActive({ ...active, steps: active.steps.map((s) => (s.operationId === operationId ? { ...s, intent } : s)) });
  };

  const doApprove = () => {
    if (!active) return;
    approve.mutate(
      {
        compositionId: active.compositionId,
        steps: active.steps.map((s) => ({ operationId: s.operationId, intent: s.intent })),
        testDecision: {
          inScope: true,
          strategy,
          rationale,
          riskLevel,
          environments: environments
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean),
        },
      },
      {
        onSuccess: () => {
          setStatus("Approved ✓");
          setActive(null);
          setGoal("");
          void utils.compose.drafts.invalidate();
        },
      },
    );
  };

  const doReject = () => {
    if (!active) return;
    reject.mutate(
      { compositionId: active.compositionId },
      {
        onSuccess: () => {
          setStatus("Rejected");
          setActive(null);
          void utils.compose.drafts.invalidate();
        },
      },
    );
  };

  useEffect(() => {
    // if there's no active draft in view, default to the first pending one so a page reload
    // doesn't lose a draft composition.
    if (!active && draftsQ.data && draftsQ.data.length > 0) setActive(draftsQ.data[0] as Draft);
  }, [draftsQ.data, active]);

  return (
    <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
      <Panel title="Compose from a goal">
        <Field label="What should this composition accomplish?">
          <textarea rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. create a ticket from scratch" />
        </Field>
        <button type="button" onClick={doPropose} disabled={propose.isPending || !goal.trim()}>
          {propose.isPending ? "Composing…" : "Propose composition"}
        </button>
        {propose.error && <div className="mt-2 text-[#ff8787]">{propose.error.message}</div>}
        {status && <div className="mt-2 inline-block rounded-full border border-[#2b7a3a] bg-[#16351f] px-2 py-[1px] text-[11px] text-[#8ce99a]">{status}</div>}

        <div className="mt-4">
          <Muted>Pending drafts</Muted>
          <QueryState isLoading={draftsQ.isLoading} error={draftsQ.error} />
          <div className="mb-2 mt-1 text-xs">
            <a href="#/exemplars">View exemplars →</a>
          </div>
          {draftsQ.data?.map((d) => (
            <button
              key={d.compositionId}
              type="button"
              className={`block w-full text-left ${active?.compositionId === d.compositionId ? "border-[--accent2]" : ""}`}
              onClick={() => setActive(d as Draft)}
            >
              {d.goal} <Muted>({d.steps.length} steps)</Muted>
            </button>
          ))}
          {draftsQ.data?.length === 0 && <Muted>No pending drafts.</Muted>}
        </div>
      </Panel>

      <Panel
        title={active ? "Draft" : "No draft selected"}
        actions={
          active && (
            <>
              <button type="button" onClick={doReject} disabled={reject.isPending}>
                Reject
              </button>
              <button
                className="rounded-lg border border-[--accent2] bg-[--accent2] px-2.5 py-1.5 font-semibold text-[#04140a]"
                type="button"
                onClick={doApprove}
                disabled={approve.isPending}
              >
                Approve
              </button>
            </>
          )
        }
      >
        {!active && <Muted>Propose a goal, or pick a pending draft on the left.</Muted>}
        {active && (
          <>
            <Field label="Goal">
              <Muted>{active.goal}</Muted>
            </Field>
            {active.rationale && (
              <Field label="Rationale">
                <Muted>{active.rationale}</Muted>
              </Field>
            )}
            <Field label="Steps">
              <div>
                {active.steps.map((s, i) => (
                  <div key={s.operationId} className="flex items-center gap-2.5 border-b border-[--line] py-2">
                    <Muted>{i + 1}.</Muted>
                    <code>{s.operationId}</code>
                    {s.autoAdded && <Chip variant="warn">auto-added dependency</Chip>}
                    {!s.autoAdded && s.fromSessionIds.length > 0 && <Chip>seen in: {s.fromSessionIds.join(", ")}</Chip>}
                    <input className="flex-1" value={s.intent} onChange={(e) => updateIntent(s.operationId, e.target.value)} />
                  </div>
                ))}
              </div>
            </Field>
            {active.unmetDependencies.length > 0 && (
              <Field label="Unmet dependencies">
                <div className="flex flex-col gap-1.5">
                  {active.unmetDependencies.map((u) => (
                    <div key={`${u.operationId}-${u.slot}`}>
                      <Chip variant="warn">{u.operationId}</Chip>{" "}
                      <Muted>
                        {u.slot}: {u.note}
                      </Muted>
                    </div>
                  ))}
                </div>
              </Field>
            )}
            {active.candidateGaps.length > 0 && (
              <Field label="Capability gaps">
                <div className="flex flex-col gap-1.5">
                  {active.candidateGaps.map((g) => (
                    <div key={g.description}>
                      <Chip variant="warn">{g.suggestedName ?? "gap"}</Chip> <Muted>{g.description}</Muted>
                    </div>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Test decision (required to approve)">
              <div className="flex flex-col gap-1.5">
                <select value={strategy} onChange={(e) => setStrategy(e.target.value as (typeof STRATEGIES)[number])}>
                  {STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as (typeof RISK_LEVELS)[number])}>
                  {RISK_LEVELS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input placeholder="rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} />
                <input
                  placeholder="environments (comma separated)"
                  value={environments}
                  onChange={(e) => setEnvironments(e.target.value)}
                />
              </div>
            </Field>
            {active.status === "approved" && (
              <div className="flex items-center gap-2.5 border-b border-[--line] py-2">
                <button
                  type="button"
                  onClick={() => generate.mutate({ compositionId: active.compositionId })}
                  disabled={generate.isPending}
                >
                  {generate.isPending ? "Generating…" : "Generate TestSpec"}
                </button>
                {generate.data && (
                  <Muted>
                    spec <code>{generate.data.specId}</code> {generate.data.valid ? "✓" : "(invalid)"}
                  </Muted>
                )}
                {generate.error && <span className="text-[#ff8787]">{generate.error.message}</span>}
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
