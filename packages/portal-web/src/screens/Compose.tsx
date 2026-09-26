import { ArrowLeftIcon, ArrowRightIcon, BotIcon, CheckIcon, ChevronRightIcon, CircleCheckIcon, FileCodeIcon, LoaderCircleIcon, PlusIcon, RotateCwIcon, TriangleAlertIcon, VideoIcon, WandSparklesIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { trpc } from "../trpc.js";
import { useSessionName } from "../sessionName.js";
import { Chip, Icon, Muted, Panel, QueryState } from "../ui.js";

// Composer screen (realignment guide §6/§9 Phase 6): a free-text goal in, a reviewable draft
// Composition out. The human never hand-picks the endpoint list — they approve (supplying the
// test decision, which ADR-0002 only sets at approval), edit intents, or reject. Approved drafts
// flow into the *unchanged* agent.generateTestSpec / testkit pipeline.
//
// Three views: #/compose is the review queue, #/compose/new creates a draft from a goal, and
// #/compose/<id> walks one composition through Review → Decide → Generate, one stage at a time.

interface DraftStep {
  operationId: string;
  intent: string;
  satisfies: string[];
  autoAdded: boolean;
  fromSessionIds: string[];
}

interface TestDecision {
  strategy: string;
  riskLevel: string;
  rationale: string;
  environments: string[];
}

interface Draft {
  compositionId: string;
  goal: string;
  status: string;
  rationale?: string;
  steps: DraftStep[];
  unmetDependencies: { operationId: string; slot: string; note: string }[];
  candidateGaps: { description: string; suggestedName?: string }[];
  sourceSessionId?: string;
  modelInfo?: { model: string };
  testDecision?: TestDecision;
  createdAt: number;
}

const STRATEGIES = [
  ["api_functional", "Functional", "Happy-path behaviour of the flow"],
  ["api_negative", "Negative", "Invalid input and error handling"],
  ["authz", "Authorization", "Who may perform each step"],
  ["contract_only", "Contract only", "Response shapes, no behaviour"],
  ["skip", "Skip", "Record the decision, don't test"],
] as const;
const RISK_LEVELS = ["critical", "high", "medium", "low"] as const;

type Strategy = (typeof STRATEGIES)[number][0];
type RiskLevel = (typeof RISK_LEVELS)[number];

const PRIMARY_BUTTON = "rounded-lg border border-[--accent2] bg-[--accent2] px-3 py-1.5 font-semibold text-[#04140a]";
const ERROR_TEXT = "text-[#ff8787]";
const WARN_BOX = "rounded-lg border border-[#7a4a1a] bg-[#3a2412] px-3 py-2 text-[#ffc078]";

function issueCount(d: Draft): number {
  return d.unmetDependencies.length + d.candidateGaps.length;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function Compose({ compositionId }: { compositionId?: string }) {
  const utils = trpc.useUtils();
  const draftsQ = trpc.compose.drafts.useQuery();
  // Compositions this screen has proposed or approved. An approved one leaves compose.drafts and
  // there is no get-by-id, so this is what keeps it in view for the Generate stage.
  const [known, setKnown] = useState<Record<string, Draft>>({});
  const [notice, setNotice] = useState("");

  const remember = (d: Draft) => setKnown((k) => ({ ...k, [d.compositionId]: d }));

  // The store returns drafts unordered; newest first puts a just-proposed draft at the top.
  const drafts = useMemo(
    () => ((draftsQ.data ?? []) as Draft[]).slice().sort((a, b) => b.createdAt - a.createdAt),
    [draftsQ.data],
  );

  if (compositionId === "new") {
    return (
      <CreateView
        onProposed={(d) => {
          remember(d);
          setNotice("");
          void utils.compose.drafts.invalidate();
          window.location.hash = `#/compose/${d.compositionId}`;
        }}
      />
    );
  }

  if (!compositionId) {
    return <QueueView drafts={drafts} draftsLoading={draftsQ.isLoading} draftsError={draftsQ.error} notice={notice} />;
  }

  const composition = known[compositionId] ?? drafts.find((d) => d.compositionId === compositionId);
  if (!composition) {
    return (
      <Panel title="Composition">
        <BackLink />
        {draftsQ.isLoading ? (
          <QueryState isLoading error={null} />
        ) : (
          <Muted>This composition isn't awaiting review. It may have been approved or rejected already.</Muted>
        )}
      </Panel>
    );
  }

  return (
    <CompositionFlow
      key={composition.compositionId}
      composition={composition}
      onApproved={(saved) => {
        remember(saved);
        void utils.compose.drafts.invalidate();
      }}
      onRejected={() => {
        setNotice(`Rejected “${composition.goal}”.`);
        void utils.compose.drafts.invalidate();
        window.location.hash = "#/compose";
      }}
    />
  );
}

function BackLink() {
  return (
    <a href="#/compose" className="mb-3 block text-xs">
      <Icon icon={ArrowLeftIcon} className="mr-1.5" />
      All compositions
    </a>
  );
}

// ---------------------------------------------------------------------------------------------
// Review queue: the drafts waiting for a decision. Creating one is a separate page.

function QueueView({
  drafts,
  draftsLoading,
  draftsError,
  notice,
}: {
  drafts: Draft[];
  draftsLoading: boolean;
  draftsError: unknown;
  notice: string;
}) {
  return (
    <div>
      <Panel
        title={`Awaiting review${drafts.length ? ` (${drafts.length})` : ""}`}
        actions={
          <a href="#/compose/new" className={`${PRIMARY_BUTTON} hover:no-underline`}>
            <Icon icon={PlusIcon} className="mr-1.5" />
            New composition
          </a>
        }
      >
        {notice && (
          <div role="status" className="mb-3 rounded-lg border border-[--line] bg-[--panel2] px-3 py-2 text-[--muted]">
            {notice}
          </div>
        )}
        <QueryState isLoading={draftsLoading} error={draftsError} />
        {!draftsLoading && drafts.length === 0 && (
          <Muted>
            Nothing to review. <a href="#/compose/new">Create a composition</a> from a goal, or compose from a
            curated <a href="#/sessions">session</a>.
          </Muted>
        )}
        <ul className="-mx-6 my-0 list-none divide-y divide-[--line] border-t border-[--line] p-0 max-[900px]:-mx-4">
          {drafts.map((d) => {
            const issues = issueCount(d);
            return (
              <li key={d.compositionId}>
                <a
                  href={`#/compose/${d.compositionId}`}
                  className="flex items-center gap-3 px-6 py-3 text-[--text] hover:bg-[--panel2] hover:no-underline max-[900px]:px-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2">{d.goal}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <Chip>{d.sourceSessionId ? "from session" : "from goal"}</Chip>
                      <Chip>{plural(d.steps.length, "step", "steps")}</Chip>
                      {issues > 0 && <Chip variant="warn">{plural(issues, "issue", "issues")}</Chip>}
                    </span>
                  </span>
                  <span aria-hidden className="text-[--accent]">
                    Review
                    <Icon icon={ChevronRightIcon} className="ml-1.5" />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Create: one question (what's the goal?). On success the new draft opens in the review flow.

function CreateView({ onProposed }: { onProposed: (d: Draft) => void }) {
  const propose = trpc.compose.propose.useMutation();
  const [goal, setGoal] = useState("");

  const submit = () => {
    if (!goal.trim() || propose.isPending) return;
    propose.mutate({ goal }, { onSuccess: (res) => onProposed(res.composition as Draft) });
  };

  return (
    <div>
      <Panel title="New composition">
        <BackLink />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="compose-goal" className="mb-1 block text-base font-semibold">
            What should the new scenario do?
          </label>
          <div id="compose-goal-hint" className="mb-2.5 text-xs text-[--muted]">
            Describe it in plain words. The composer picks and orders Ready operations from the catalog; you review
            the result before anything becomes a test.
          </div>
          <textarea
            id="compose-goal"
            className="w-full resize-y"
            rows={4}
            // biome-ignore lint/a11y/noAutofocus: the goal is the only field on this page
            autoFocus
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. create a ticket from scratch"
            aria-describedby="compose-goal-hint"
          />
          <div aria-live="polite">{propose.error && <div className={`mt-2 ${ERROR_TEXT}`}>{propose.error.message}</div>}</div>
          <Footer>
            <span className="mr-auto text-xs text-[--muted]">⌘/Ctrl + Enter</span>
            <a href="#/compose" className="rounded-lg border border-[--line] px-2.5 py-1.5 text-[--text] hover:no-underline">
              Cancel
            </a>
            <button type="submit" className={PRIMARY_BUTTON} disabled={propose.isPending || !goal.trim()}>
              <Icon icon={propose.isPending ? LoaderCircleIcon : WandSparklesIcon} spin={propose.isPending} className="mr-1.5" />
              {propose.isPending ? "Composing… this can take a moment" : "Propose composition"}
            </button>
          </Footer>
        </form>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// One composition, one stage at a time.

type Stage = "review" | "decide" | "generate";
const STAGES: [Stage, string][] = [
  ["review", "Review steps"],
  ["decide", "Decide testing"],
  ["generate", "Generate TestSpec"],
];

function Stepper({ stage }: { stage: Stage }) {
  const current = STAGES.findIndex(([s]) => s === stage);
  return (
    <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0 text-xs" aria-label="Progress">
      {STAGES.map(([key, label], i) => (
        <li key={key} className="flex items-center gap-2" aria-current={i === current ? "step" : undefined}>
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
              i < current
                ? "border-[--accent2] bg-[--accent2] text-[#04140a]"
                : i === current
                  ? "border-[--accent] text-[--accent]"
                  : "border-[--line] text-[--muted]"
            }`}
          >
            {i < current ? <Icon icon={CheckIcon} className="text-[10px]" /> : i + 1}
          </span>
          <span className={i === current ? "font-semibold text-[--text]" : "text-[--muted]"}>{label}</span>
          {i < STAGES.length - 1 && <span aria-hidden className="h-px w-6 bg-[--line]" />}
        </li>
      ))}
    </ol>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-[--line] pt-3">{children}</div>;
}

function CompositionFlow({
  composition,
  onApproved,
  onRejected,
}: {
  composition: Draft;
  onApproved: (saved: Draft) => void;
  onRejected: () => void;
}) {
  const approve = trpc.compose.approve.useMutation();
  const [stage, setStage] = useState<Stage>(composition.status === "draft" ? "review" : "generate");
  const [steps, setSteps] = useState(composition.steps);
  const [decision, setDecision] = useState<DecisionForm>({
    strategy: "api_functional",
    riskLevel: "medium",
    rationale: "",
    environments: "",
  });
  const fromSession = Boolean(composition.sourceSessionId);
  const sessionName = useSessionName(composition.sourceSessionId);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stage]);

  const doApprove = () => {
    approve.mutate(
      {
        compositionId: composition.compositionId,
        steps: steps.map((s) => ({ operationId: s.operationId, intent: s.intent })),
        testDecision: {
          inScope: true,
          strategy: decision.strategy,
          rationale: decision.rationale,
          riskLevel: decision.riskLevel,
          environments: decision.environments
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean),
        },
      },
      {
        onSuccess: (saved) => {
          onApproved(saved as Draft);
          setStage("generate");
        },
      },
    );
  };

  return (
    <div>
      <Panel>
        <BackLink />
        <h2 className="m-0 text-lg">{composition.goal}</h2>
        <div className="mb-4 mt-1 text-xs text-[--muted]">
          {fromSession ? (
            <>
              <Icon icon={VideoIcon} className="mr-1.5" />
              Built from the recorded calls of session{" "}
              <a href={`#/sessions/${composition.sourceSessionId}`}>{sessionName}</a>
            </>
          ) : (
            <>
              <Icon icon={BotIcon} className="mr-1.5" />
              Proposed by {composition.modelInfo?.model ?? "the composer"} from your goal
            </>
          )}
        </div>
        <Stepper stage={stage} />
      </Panel>

      <Panel>
        {stage === "review" && (
          <ReviewStage
            composition={composition}
            steps={steps}
            setSteps={setSteps}
            onContinue={() => setStage("decide")}
            onRejected={onRejected}
          />
        )}
        {stage === "decide" && (
          <DecideStage
            stepCount={steps.length}
            decision={decision}
            setDecision={setDecision}
            onBack={() => setStage("review")}
            onApprove={doApprove}
            approving={approve.isPending}
            error={approve.error?.message}
          />
        )}
        {stage === "generate" && <GenerateStage composition={composition} />}
      </Panel>
    </div>
  );
}

// --- Stage 1: are these the right steps? ---------------------------------------------------------

function ReviewStage({
  composition,
  steps,
  setSteps,
  onContinue,
  onRejected,
}: {
  composition: Draft;
  steps: DraftStep[];
  setSteps: (steps: DraftStep[]) => void;
  onContinue: () => void;
  onRejected: () => void;
}) {
  const reject = trpc.compose.reject.useMutation();
  const [confirmingReject, setConfirmingReject] = useState(false);
  const fromSession = Boolean(composition.sourceSessionId);

  const unmetByOp = new Map<string, Draft["unmetDependencies"]>();
  for (const u of composition.unmetDependencies) {
    unmetByOp.set(u.operationId, [...(unmetByOp.get(u.operationId) ?? []), u]);
  }

  // Keyed by step index: session-sourced compositions repeat operations, so operationId isn't unique.
  const updateIntent = (index: number, intent: string) => {
    setSteps(steps.map((s, i) => (i === index ? { ...s, intent } : s)));
  };

  return (
    <>
      <h3 className="m-0 text-base">Are these the right steps?</h3>
      <p className="mb-3 mt-1 text-[--muted]">
        {fromSession
          ? "They replay the session's recorded calls in order. You can reword what each step should achieve."
          : "Check the order, and reword any step whose intent isn't what you meant."}
      </p>

      {issueCount(composition) > 0 && (
        <div role="note" className={`mb-3 ${WARN_BOX}`}>
          <Icon icon={TriangleAlertIcon} className="mr-1.5" />
          {[
            composition.unmetDependencies.length > 0 &&
              plural(composition.unmetDependencies.length, "unmet dependency", "unmet dependencies"),
            composition.candidateGaps.length > 0 && plural(composition.candidateGaps.length, "capability gap", "capability gaps"),
          ]
            .filter(Boolean)
            .join(" and ")}{" "}
          — the test may not run end to end. They are marked below.
        </div>
      )}

      <ol className="m-0 list-none p-0">
        {steps.map((s, i) => {
          const unmet = unmetByOp.get(s.operationId) ?? [];
          return (
            <li key={`${i}-${s.operationId}`} className="flex gap-3 border-b border-[--line] py-2.5 last:border-b-0">
              <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[--chip] text-xs text-[--muted]">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <input
                  aria-label={`Intent for step ${i + 1}`}
                  className="w-full"
                  value={s.intent}
                  onChange={(e) => updateIntent(i, e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <a href={`#/catalog/${encodeURIComponent(s.operationId)}`}>
                    <code>{s.operationId}</code>
                  </a>
                  {s.autoAdded && <Chip variant="warn">added to satisfy a dependency</Chip>}
                </div>
                {unmet.map((u) => (
                  <div key={u.slot} className="text-xs text-[#ffc078]">
                    Needs <code>{u.slot}</code>: {u.note}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      {composition.candidateGaps.length > 0 && (
        <div className="mt-4">
          <h4 className="m-0 text-sm">Not in the catalog</h4>
          <p className="mb-2 mt-0.5 text-xs text-[--muted]">The goal seems to need these, but no operation provides them.</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {composition.candidateGaps.map((g) => (
              <li key={g.description}>
                <Chip variant="warn">{g.suggestedName ?? "gap"}</Chip> <Muted>{g.description}</Muted>
              </li>
            ))}
          </ul>
        </div>
      )}

      {composition.rationale && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-[--muted]">Why the composer chose these steps</summary>
          <p className="mb-0 mt-2 border-l-2 border-[--line] pl-3 text-[--muted]">{composition.rationale}</p>
        </details>
      )}

      <Footer>
        {reject.error && <span className={`mr-auto ${ERROR_TEXT}`}>{reject.error.message}</span>}
        {confirmingReject ? (
          <>
            <span className="mr-auto text-[--muted]">Reject this draft? It leaves the review queue.</span>
            <button type="button" onClick={() => setConfirmingReject(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="border-[#8a2b2b] text-[#ff8787]"
              onClick={() => reject.mutate({ compositionId: composition.compositionId }, { onSuccess: onRejected })}
              disabled={reject.isPending}
            >
              <Icon icon={reject.isPending ? LoaderCircleIcon : XIcon} spin={reject.isPending} className="mr-1.5" />
              {reject.isPending ? "Rejecting…" : "Yes, reject"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="mr-auto" onClick={() => setConfirmingReject(true)}>
              <Icon icon={XIcon} className="mr-1.5" />
              Reject draft
            </button>
            <button type="button" className={PRIMARY_BUTTON} onClick={onContinue}>
              Steps look right
              <Icon icon={ArrowRightIcon} className="ml-1.5" />
            </button>
          </>
        )}
      </Footer>
    </>
  );
}

// --- Stage 2: how should this be tested? ---------------------------------------------------------

interface DecisionForm {
  strategy: Strategy;
  riskLevel: RiskLevel;
  rationale: string;
  environments: string;
}

function DecideStage({
  stepCount,
  decision,
  setDecision,
  onBack,
  onApprove,
  approving,
  error,
}: {
  stepCount: number;
  decision: DecisionForm;
  setDecision: (d: DecisionForm) => void;
  onBack: () => void;
  onApprove: () => void;
  approving: boolean;
  error: string | undefined;
}) {
  const set = <K extends keyof DecisionForm>(key: K, value: DecisionForm[K]) => setDecision({ ...decision, [key]: value });

  return (
    <>
      <h3 className="m-0 text-base">How should this be tested?</h3>
      <p className="mb-4 mt-1 text-[--muted]">
        Recorded on the composition when you approve its {plural(stepCount, "step", "steps")}, and used to shape the
        TestSpec.
      </p>

      <fieldset className="m-0 mb-4 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-semibold">Strategy</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
          {STRATEGIES.map(([value, label, description]) => (
            <label
              key={value}
              className={`flex cursor-pointer gap-2 rounded-lg border px-2.5 py-2 ${
                decision.strategy === value ? "border-[--accent] bg-[--panel2]" : "border-[--line]"
              }`}
            >
              <input
                type="radio"
                name="strategy"
                className="m-0 mt-1 h-4 w-4 shrink-0 p-0 accent-[--accent]"
                checked={decision.strategy === value}
                onChange={() => set("strategy", value)}
              />
              <span className="flex flex-col">
                <span>{label}</span>
                <span className="text-xs text-[--muted]">{description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 mb-4 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-semibold">Risk level</legend>
        <div className="flex flex-wrap gap-2">
          {RISK_LEVELS.map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 capitalize ${
                decision.riskLevel === r ? "border-[--accent] bg-[--panel2]" : "border-[--line]"
              }`}
            >
              <input
                type="radio"
                name="risk"
                className="m-0 h-4 w-4 p-0 accent-[--accent]"
                checked={decision.riskLevel === r}
                onChange={() => set("riskLevel", r)}
              />
              {r}
            </label>
          ))}
        </div>
      </fieldset>

      <details className="group">
        <summary className="cursor-pointer text-sm text-[--muted]">Add a rationale or limit environments (optional)</summary>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[--muted]">Rationale</span>
            <textarea
              rows={2}
              value={decision.rationale}
              onChange={(e) => set("rationale", e.target.value)}
              placeholder="Why this strategy and risk level"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[--muted]">Environments</span>
            <input
              value={decision.environments}
              onChange={(e) => set("environments", e.target.value)}
              placeholder="staging, qa"
              aria-describedby="compose-env-hint"
            />
            <span id="compose-env-hint" className="text-xs text-[--muted]">
              Comma-separated. Leave empty for no restriction.
            </span>
          </label>
        </div>
      </details>

      <Footer>
        {error && <span className={`mr-auto ${ERROR_TEXT}`}>{error}</span>}
        <button type="button" className={error ? "" : "mr-auto"} onClick={onBack}>
          <Icon icon={ArrowLeftIcon} className="mr-1.5" />
          Back to steps
        </button>
        <button type="button" className={PRIMARY_BUTTON} onClick={onApprove} disabled={approving}>
          <Icon icon={approving ? LoaderCircleIcon : CheckIcon} spin={approving} className="mr-1.5" />
          {approving ? "Approving…" : "Approve composition"}
        </button>
      </Footer>
    </>
  );
}

// --- Stage 3: turn it into a TestSpec ------------------------------------------------------------

function GenerateStage({ composition }: { composition: Draft }) {
  const generate = trpc.agent.generate.useMutation();
  const fromSession = Boolean(composition.sourceSessionId);
  const decision = composition.testDecision;

  return (
    <>
      <h3 className="m-0 text-base">Approved. Generate the TestSpec</h3>
      <p className="mb-4 mt-1 text-[--muted]">
        {fromSession
          ? "The TestSpec is built directly from the recorded calls."
          : "The agent writes a TestSpec from the approved steps and test decision."}
      </p>

      {decision && (
        <dl className="m-0 mb-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-lg border border-[--line] px-3 py-2">
          <dt className="text-[--muted]">Steps</dt>
          <dd className="m-0">{composition.steps.length}</dd>
          <dt className="text-[--muted]">Strategy</dt>
          <dd className="m-0">{STRATEGIES.find(([v]) => v === decision.strategy)?.[1] ?? decision.strategy}</dd>
          <dt className="text-[--muted]">Risk</dt>
          <dd className="m-0 capitalize">{decision.riskLevel}</dd>
          <dt className="text-[--muted]">Environments</dt>
          <dd className="m-0">{decision.environments.join(", ") || <Muted>any</Muted>}</dd>
          {decision.rationale && (
            <>
              <dt className="text-[--muted]">Rationale</dt>
              <dd className="m-0">{decision.rationale}</dd>
            </>
          )}
        </dl>
      )}

      <div aria-live="polite" className="flex flex-col gap-2">
        {generate.data?.valid && (
          <div className="rounded-lg border border-[#2b7a3a] bg-[#16351f] px-3 py-2 text-[#8ce99a]">
            <Icon icon={CircleCheckIcon} className="mr-1.5" />
            Test “{composition.goal}” generated.
          </div>
        )}
        {generate.data && !generate.data.valid && (
          <div className={WARN_BOX}>
            <Icon icon={TriangleAlertIcon} className="mr-1.5" />
            Test “{composition.goal}” was saved but failed validation
            {generate.data.errors.length > 0 && ":"}
            <ul className="m-0 mt-1 pl-5">
              {generate.data.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <a href={`#/specs/${encodeURIComponent(generate.data.specId)}`} className="mt-1.5 inline-block">
              View the test
              <Icon icon={ArrowRightIcon} className="ml-1.5" />
            </a>
          </div>
        )}
        {generate.error && <span className={ERROR_TEXT}>{generate.error.message}</span>}
      </div>

      <Footer>
        {generate.data?.valid ? (
          <>
            <a href="#/compose" className="mr-auto">
              <Icon icon={PlusIcon} className="mr-1.5" />
              Compose another
            </a>
            <a href={`#/specs/${encodeURIComponent(generate.data.specId)}`} className={`${PRIMARY_BUTTON} hover:no-underline`}>
              Open in Specs
              <Icon icon={ArrowRightIcon} className="ml-1.5" />
            </a>
          </>
        ) : (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => generate.mutate({ compositionId: composition.compositionId })}
            disabled={generate.isPending}
          >
            <Icon icon={generate.isPending ? LoaderCircleIcon : generate.data ? RotateCwIcon : FileCodeIcon} spin={generate.isPending} className="mr-1.5" />
            {generate.isPending ? "Generating…" : generate.data ? "Try again" : "Generate TestSpec"}
          </button>
        )}
      </Footer>
    </>
  );
}
