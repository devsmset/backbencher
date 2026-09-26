import { CheckIcon, CopyIcon, DownloadIcon, LoaderCircleIcon, PlayIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { trpc } from "../trpc.js";
import { Chip, Dialog, Icon, JsonBlock, Muted, Panel, QueryState } from "../ui.js";
import { MethodBadge } from "./OperationDetail.js";

// TestSpecs: the list of generated tests, and a popup rendering the selected spec for reading —
// steps with their operations named, what each sends, extracts and expects — with the raw YAML a tab away.

const ORIGIN: Record<string, string> = {
  "session-replay": "from a recorded session",
  agent: "composed from a goal",
  "authz-generator": "authorization matrix",
  "bola-generator": "BOLA probe",
};

const TH = "border-b border-[--line] px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]";
const TD = "border-b border-[--line] px-3 py-2 align-top";

function runVariant(status: string): "ok" | "warn" | "derived" {
  if (status === "passed") return "ok";
  if (status === "flaky" || status === "failed") return "warn";
  return "derived";
}

function statusVariant(status: string): "ok" | "warn" | "derived" {
  if (status === "generated" || status === "approved") return "ok";
  if (status === "invalid") return "warn";
  return "derived";
}

function specHref(specId: string): string {
  return `#/specs/${encodeURIComponent(specId)}`;
}

// File name from the test's title ("Create a ticket" → create-a-ticket.yaml); the id only when
// there's no usable title.
function saveYaml(title: string | null, specId: string, yaml: string) {
  const slug = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const url = URL.createObjectURL(new Blob([yaml], { type: "application/yaml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug || specId}.yaml`;
  a.click();
  URL.revokeObjectURL(url);
}

function Origin({ spec }: { spec: { generatedBy: string | null; sourceSession: { sessionId: string; name: string | null } | null } }) {
  return spec.sourceSession ? (
    <>
      from session <a href={`#/sessions/${spec.sourceSession.sessionId}`}>{spec.sourceSession.name ?? "Untitled session"}</a>
    </>
  ) : (
    <>{ORIGIN[spec.generatedBy ?? ""] ?? "generated"}</>
  );
}

export function Specs({ selectedId }: { selectedId?: string }) {
  const utils = trpc.useUtils();
  const specs = trpc.specs.list.useQuery();
  const run = trpc.runs.start.useMutation();
  const authz = trpc.security.authzMatrix.useMutation({ onSuccess: () => utils.specs.list.invalidate() });
  const bola = trpc.security.bolaProbes.useMutation({ onSuccess: () => utils.specs.list.invalidate() });
  const [env, setEnv] = useState("staging");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [last, setLast] = useState<Record<string, string>>({});

  const download = async (specId: string, title: string | null) => {
    setDownloadError(null);
    try {
      const row = await utils.specs.get.fetch({ specId });
      if (!row) throw new Error(`“${title ?? "Untitled test"}” no longer exists`);
      saveYaml(title, specId, row.yaml);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : String(e));
    }
  };
  const startRun = (specId: string) =>
    run.mutate({ specId, env }, { onSuccess: (r) => setLast((prev) => ({ ...prev, [specId]: r.status })) });

  return (
    <>
      <Panel
        title="TestSpecs"
        actions={
          <>
            <button type="button" disabled={authz.isPending} onClick={() => authz.mutate({ environment: env })}>
              <Icon icon={PlusIcon} className="mr-1.5" />
              authz matrix
            </button>
            <button type="button" disabled={bola.isPending} onClick={() => bola.mutate({ environment: env })}>
              <Icon icon={PlusIcon} className="mr-1.5" />
              BOLA probes
            </button>
            <label className="flex items-center gap-1.5 text-xs text-[--muted]">
              env
              <input className="w-28" value={env} onChange={(e) => setEnv(e.target.value)} />
            </label>
          </>
        }
      >
        <QueryState isLoading={specs.isLoading} error={specs.error} />
        {(specs.data?.length ?? 0) > 0 && (
          <div className="-mx-6 overflow-x-auto max-[900px]:-mx-4">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${TH} pl-6 max-[900px]:pl-4`}>Test</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Run</th>
                  <th className={`${TH} pr-6`}>Export</th>
                </tr>
              </thead>
              <tbody>
                {(specs.data ?? []).map((s) => (
                  <tr
                    key={s.specId}
                    onClick={() => {
                      window.location.hash = specHref(s.specId);
                    }}
                    className="cursor-pointer hover:bg-[--panel2]"
                  >
                    <td className={`${TD} pl-6 max-[900px]:pl-4`}>
                      {/* The id stays reachable on hover for anyone matching logs or files. */}
                      <a
                        href={specHref(s.specId)}
                        title={`Spec ${s.specId}`}
                        className="text-[--text] hover:no-underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {s.title ?? <Muted>Untitled test</Muted>}
                      </a>
                      <div className="text-xs text-[--muted]">
                        <Origin spec={s} />
                        {" · "}
                        {new Date(s.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td className={TD}>
                      <Chip variant={statusVariant(s.status)}>{s.status}</Chip>
                    </td>
                    <td className={TD} onClick={(e) => e.stopPropagation()}>
                      <button type="button" disabled={run.isPending} onClick={() => startRun(s.specId)}>
                        <Icon icon={PlayIcon} className="mr-1.5" />
                        Run
                      </button>{" "}
                      {last[s.specId] && <Chip variant={runVariant(last[s.specId] as string)}>{last[s.specId]}</Chip>}
                    </td>
                    <td className={`${TD} pr-6`} onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => void download(s.specId, s.title)}>
                        <Icon icon={DownloadIcon} className="mr-1.5" />
                        Download YAML
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {specs.data?.length === 0 && <Muted>No specs. Generate one from an approved scenario.</Muted>}
        {downloadError && <div className="mt-2 text-[#ff8787]">{downloadError}</div>}
        {run.error && <div className="mt-2 text-[#ff8787]">{run.error.message}</div>}
      </Panel>

      {/* The spec opens as a full-size popup over the list; #/specs/<id> links straight to it. */}
      {selectedId && (
        <SpecDetail
          key={selectedId}
          specId={selectedId}
          env={env}
          running={run.isPending}
          lastRun={last[selectedId]}
          onRun={() => startRun(selectedId)}
          onDownload={(title) => void download(selectedId, title)}
          onClose={() => {
            window.location.hash = "#/specs";
          }}
        />
      )}
    </>
  );
}

// ---- Viewer ------------------------------------------------------------------------------------

type StepView = {
  id: string;
  operationId: string;
  description: string;
  request?: { pathParams?: Record<string, string>; query?: Record<string, string>; headers?: Record<string, string>; body?: unknown };
  extract?: Record<string, string>;
  expect: { status: number | number[]; schemaConformance: boolean; jsonAssertions: { path: string; op: string; value?: unknown }[] };
  poll?: { untilStatus?: number; untilPath?: string; untilValue?: unknown; timeoutMs: number; intervalMs: number };
  continueOnFailure: boolean;
};

/** Shows `{{steps.login.extract.token}}`-style references in the accent colour, so data handed between steps stands out. */
function Templated({ value }: { value: string }) {
  return (
    <code className="break-all">
      {value.split(/(\{\{[^}]+\}\})/).map((part, i) =>
        part.startsWith("{{") ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
          <span key={i} className="text-[--accent]">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </code>
  );
}

function KeyValues({ label, values }: { label: string; values: Record<string, string> | undefined }) {
  const entries = Object.entries(values ?? {});
  if (entries.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="mb-0.5 text-xs text-[--muted]">{label}</div>
      <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <code>{k}</code>
            </dt>
            <dd className="m-0 min-w-0">
              <Templated value={String(v)} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function assertionText(a: { path: string; op: string; value?: unknown }): ReactNode {
  return (
    <>
      <code>{a.path}</code> <span className="text-[--muted]">{a.op}</span>
      {a.value !== undefined && (
        <>
          {" "}
          <code>{JSON.stringify(a.value)}</code>
        </>
      )}
    </>
  );
}

function SpecDetail({
  specId,
  env,
  running,
  lastRun,
  onRun,
  onDownload,
  onClose,
}: {
  specId: string;
  env: string;
  running: boolean;
  lastRun: string | undefined;
  onRun: () => void;
  onDownload: (title: string | null) => void;
  onClose: () => void;
}) {
  const view = trpc.specs.view.useQuery({ specId });
  const ops = trpc.operations.list.useQuery();
  const opsById = useMemo(() => new Map((ops.data ?? []).map((o) => [o.operationId, o])), [ops.data]);
  const [tab, setTab] = useState<"steps" | "yaml">("steps");
  const [copied, setCopied] = useState(false);

  if (!view.data) {
    return (
      <Dialog size="full" title="TestSpec" onClose={onClose}>
        <Panel>
          <QueryState isLoading={view.isLoading} error={view.error ?? (view.data === null ? new Error("This spec no longer exists") : null)} />
        </Panel>
      </Dialog>
    );
  }

  const v = view.data;
  const spec = v.spec;

  const opLine = (operationId: string) => {
    const op = opsById.get(operationId);
    if (!op) return <code className="text-xs text-[--muted]">{operationId}</code>;
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <MethodBadge method={op.method} />
        <code className="truncate text-xs" title={op.pathTemplate.template}>
          {op.pathTemplate.template}
        </code>
        {op.name && (
          <a href={`#/catalog/${encodeURIComponent(operationId)}`} className="text-xs">
            {op.name}
          </a>
        )}
      </span>
    );
  };

  const copyYaml = async () => {
    try {
      await navigator.clipboard.writeText(v.yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog size="full" title={v.title ?? "Untitled test"} onClose={onClose}>
      <Panel>
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[--muted]">
          <Chip variant={statusVariant(v.status)}>{v.status}</Chip>
          <span>
            <Origin spec={v} />
          </span>
          <span>{new Date(v.createdAt).toLocaleString()}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-[--accent] bg-[--accent] px-3 py-1.5 font-semibold text-[#06121f]"
            disabled={running}
            onClick={onRun}
          >
            <Icon icon={running ? LoaderCircleIcon : PlayIcon} spin={running} className="mr-1.5" />
            {running ? "Running…" : `Run on ${env}`}
          </button>
          <button type="button" onClick={() => onDownload(v.title)}>
            <Icon icon={DownloadIcon} className="mr-1.5" />
            Download YAML
          </button>
          {lastRun && <Chip variant={runVariant(lastRun)}>last run: {lastRun}</Chip>}
        </div>
      </Panel>

      {(v.parseError || v.errors.length > 0) && (
        <Panel title="Why it's invalid">
          <ul role="note" className="m-0 flex list-none flex-col gap-1 p-0 text-[#ffc078]">
            {v.parseError ? (
              <li>
                <Icon icon={TriangleAlertIcon} className="mr-1.5" />
                The YAML doesn't load as a TestSpec: {v.parseError}
              </li>
            ) : (
              v.errors.map((e) => (
                <li key={e}>
                  <Icon icon={TriangleAlertIcon} className="mr-1.5" />
                  {e}
                </li>
              ))
            )}
          </ul>
        </Panel>
      )}

      <Panel>
        <div className="mb-4 flex gap-1" role="tablist" aria-label="View">
          {(
            [
              ["steps", "Steps"],
              ["yaml", "YAML"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-full px-3 py-1 text-xs ${tab === key ? "border-[--accent] bg-[--panel2] text-[--text]" : "text-[--muted]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "yaml" && (
          <div role="tabpanel">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => void copyYaml()}>
                <Icon icon={copied ? CheckIcon : CopyIcon} className="mr-1.5" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="m-0 max-h-[70vh] overflow-auto rounded-[10px] border border-[--line] bg-[#0a1016] p-3 font-mono text-xs leading-[1.55]">
              {v.yaml}
            </pre>
          </div>
        )}

        {tab === "steps" && (
          <div role="tabpanel">
            {!spec ? (
              <Muted>The YAML can't be read as a TestSpec. Switch to the YAML tab to see it as written.</Muted>
            ) : (
              <>
                <dl className="m-0 mb-5 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
                  <dt className="text-[--muted]">Environment</dt>
                  <dd className="m-0">{spec.environment}</dd>
                  <dt className="text-[--muted]">Auth profile</dt>
                  <dd className="m-0">{spec.authProfile}</dd>
                  {spec.tags.length > 0 && (
                    <>
                      <dt className="text-[--muted]">Tags</dt>
                      <dd className="m-0 flex flex-wrap gap-1">
                        {spec.tags.map((t) => (
                          <Chip key={t}>{t}</Chip>
                        ))}
                      </dd>
                    </>
                  )}
                  {v.model && (
                    <>
                      <dt className="text-[--muted]">Model</dt>
                      <dd className="m-0">{v.model}</dd>
                    </>
                  )}
                </dl>

                <h4 className="m-0 mb-2 text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Steps ({spec.steps.length})</h4>
                <ol className="m-0 mb-5 list-none p-0">
                  {(spec.steps as StepView[]).map((step, i) => (
                    <li key={step.id} className="flex gap-3 border-b border-[--line] py-3 last:border-b-0">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[--chip] text-xs text-[--muted]">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span>{step.description}</span>
                          <code className="text-[11px] text-[--muted]">{step.id}</code>
                        </div>
                        <div className="mt-1">{opLine(step.operationId)}</div>

                        <KeyValues label="Path params" values={step.request?.pathParams} />
                        <KeyValues label="Query" values={step.request?.query} />
                        <KeyValues label="Headers" values={step.request?.headers} />
                        {step.request?.body !== undefined && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-[--muted]">Request body</summary>
                            <div className="mt-1.5">
                              <JsonBlock value={step.request.body} />
                            </div>
                          </details>
                        )}

                        {step.extract && Object.keys(step.extract).length > 0 && (
                          <div className="mt-2">
                            <div className="mb-0.5 text-xs text-[--muted]">Extracts</div>
                            <ul className="m-0 list-none p-0 text-xs">
                              {Object.entries(step.extract).map(([name, path]) => (
                                <li key={name}>
                                  <code className="text-[--accent]">{name}</code> <span className="text-[--muted]">from</span>{" "}
                                  <code>{path}</code>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="mt-2">
                          <div className="mb-0.5 text-xs text-[--muted]">Expects</div>
                          <ul className="m-0 list-none p-0 text-xs">
                            <li>
                              status{" "}
                              <code>{Array.isArray(step.expect.status) ? step.expect.status.join(" or ") : step.expect.status}</code>
                              {step.expect.schemaConformance && <span className="text-[--muted]">, response matches the observed schema</span>}
                            </li>
                            {step.expect.jsonAssertions.map((a) => (
                              <li key={`${a.path}-${a.op}`}>{assertionText(a)}</li>
                            ))}
                          </ul>
                        </div>

                        {step.poll && (
                          <div className="mt-2 text-xs text-[--muted]">
                            Polls every {step.poll.intervalMs} ms for up to {step.poll.timeoutMs} ms
                            {step.poll.untilStatus !== undefined && ` until status ${step.poll.untilStatus}`}
                            {step.poll.untilPath && ` until ${step.poll.untilPath} = ${JSON.stringify(step.poll.untilValue)}`}.
                          </div>
                        )}
                        {step.continueOnFailure && (
                          <div className="mt-2">
                            <Chip>continues on failure</Chip>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>

                <h4 className="m-0 mb-2 text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Cleanup ({spec.cleanup.length})</h4>
                {spec.cleanup.length === 0 ? (
                  <Muted>No cleanup. Anything this test creates stays in the environment.</Muted>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {spec.cleanup.map((c, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: cleanup entries have no id
                      <li key={i} className="border-b border-[--line] py-2 last:border-b-0">
                        {opLine(c.operationId)}
                        {!c.ignoreFailure && <div className="mt-1 text-xs text-[--muted]">A failure here fails the run.</div>}
                        {c.request !== undefined && (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-xs text-[--muted]">Request</summary>
                            <div className="mt-1.5">
                              <JsonBlock value={c.request} />
                            </div>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </Panel>
    </Dialog>
  );
}
