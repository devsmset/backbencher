import { useEffect, useState } from "react";
import { trpc } from "../trpc.js";
import { Field, Muted, Panel, QueryState } from "../ui.js";

type Strategy = "api_functional" | "api_negative" | "authz" | "contract_only" | "skip";
type Risk = "critical" | "high" | "medium" | "low";

export function ScenarioBuilder({ flowId }: { flowId: string }) {
  const utils = trpc.useUtils();
  const draft = trpc.scenarios.fromFlow.useQuery({ flowId });
  const upsert = trpc.scenarios.upsert.useMutation();
  const generate = trpc.agent.generate.useMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<{ operationId: string; intent: string }[]>([]);
  const [strategy, setStrategy] = useState<Strategy>("api_functional");
  const [risk, setRisk] = useState<Risk>("medium");
  const [savedId, setSavedId] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (draft.data) setSteps(draft.data.steps.map((s) => ({ operationId: s.operationId, intent: s.intent })));
  }, [draft.data]);

  const submit = (reviewState: "unreviewed" | "approved") => {
    upsert.mutate(
      {
        scenarioId: savedId || "",
        name,
        description,
        sourceFlowIds: [flowId],
        steps,
        testDecision: { inScope: true, strategy, rationale: "", riskLevel: risk, environments: [] },
        reviewState,
        updatedBy: "",
        updatedAt: 0,
      },
      {
        onSuccess: (s) => {
          setSavedId(s.scenarioId);
          setStatus(reviewState === "approved" ? "Approved ✓" : "Saved draft ✓");
          void utils.scenarios.list.invalidate();
        },
      },
    );
  };

  return (
    <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
      <Panel title="Observed flow" actions={<code>{flowId}</code>}>
        <QueryState isLoading={draft.isLoading} error={draft.error} />
        {steps.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: ordered flow steps
          <div key={i} className="flex items-center gap-2.5 border-b border-[--line] py-2">
            <Muted>{i + 1}.</Muted> <code>{s.operationId}</code>
            <input
              className="flex-1"
              placeholder="intent…"
              value={s.intent}
              onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, intent: e.target.value } : x)))}
            />
          </div>
        ))}
        {draft.data === null && <Muted>Flow not found.</Muted>}
      </Panel>

      <Panel
        title="Scenario"
        actions={
          <>
            <button type="button" onClick={() => submit("unreviewed")} disabled={upsert.isPending}>
              Save draft
            </button>
            <button
              className="rounded-lg border border-[--accent2] bg-[--accent2] px-2.5 py-1.5 font-semibold text-[#04140a]"
              type="button"
              onClick={() => submit("approved")}
              disabled={upsert.isPending}
            >
              Approve
            </button>
          </>
        }
      >
        {status && <div className="inline-block rounded-full border border-[#2b7a3a] bg-[#16351f] px-2 py-[1px] text-[11px] text-[#8ce99a]">{status}</div>}
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Invoice lifecycle: create → send → void" />
        </Field>
        <Field label="Description (intent)">
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
          <Field label="Strategy">
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
              {(["api_functional", "api_negative", "authz", "contract_only", "skip"] as Strategy[]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Risk">
            <select value={risk} onChange={(e) => setRisk(e.target.value as Risk)}>
              {(["critical", "high", "medium", "low"] as Risk[]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {savedId && (
          <Muted>
            scenarioId <code>{savedId}</code>
          </Muted>
        )}
        {savedId && (
          <div className="flex items-center gap-2.5 border-b border-[--line] py-2">
            <button type="button" onClick={() => generate.mutate({ scenarioId: savedId })} disabled={generate.isPending}>
              {generate.isPending ? "Generating…" : "Generate TestSpec"}
            </button>
            {generate.data && (
              <Muted>
                spec <code>{generate.data.specId}</code> {generate.data.valid ? "\u2713" : "(invalid)"}
              </Muted>
            )}
            {generate.error && <span className="text-[#ff8787]">{generate.error.message}</span>}
          </div>
        )}
      </Panel>
    </div>
  );
}
