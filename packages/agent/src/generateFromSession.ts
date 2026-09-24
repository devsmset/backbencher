import { join } from "node:path";
import { jsonPathTail, loadCuratedOrRawSession, pairCalls, walkScalars } from "@backbencher/derive";
import { type SessionCallEdge, type TestSpec, type TestSpecStep, TestSpecSchema } from "@backbencher/schemas";
import { dataDir, newId } from "@backbencher/shared";
import type { Store } from "@backbencher/store";
import { dump as dumpYaml } from "js-yaml";
import { computeDependencyGraph } from "./dependencies.js";
import { validateSpec } from "./generate.js";

// Deterministic generator (spec §3), the session-sourced counterpart to generateTestSpec in
// generate.ts. agent.generate calls it instead of the LLM path when a Composition carries
// sourceSessionId. Same result shape and same "invalid" terminal state as the LLM path, so the
// router and the portal-web Specs screen need no branching of their own.

export interface GenerateFromSessionResult {
  specId: string;
  spec: TestSpec | null;
  valid: boolean;
  errors: string[];
}

/** Per producer step: which response JSONPaths get declared as `extract` vars, and under what
 * name. Lazy and shared, so several consumers of one value reuse a single extract entry. */
class ExtractRegistry {
  private byStep = new Map<string, Map<string, string>>();

  varFor(producerStepId: string, jsonPath: string): string {
    let vars = this.byStep.get(producerStepId);
    if (!vars) {
      vars = new Map();
      this.byStep.set(producerStepId, vars);
    }
    const existing = vars.get(jsonPath);
    if (existing) return existing;
    const base = jsonPathTail(jsonPath);
    let candidate = base;
    let n = 1;
    while ([...vars.values()].includes(candidate)) candidate = `${base}${++n}`;
    vars.set(jsonPath, candidate);
    return candidate;
  }

  extractFor(stepId: string): Record<string, string> | undefined {
    const vars = this.byStep.get(stepId);
    if (!vars || vars.size === 0) return undefined;
    return Object.fromEntries([...vars].map(([path, varName]) => [varName, path]));
  }
}

// SessionCallEdge JSON paths collapse array indices to "[*]" (jsonpath.ts's walkScalars). That is
// fine for matching, but ambiguous for writing a substitution back into one specific captured
// document when more than one array element shares a path — so v1 only templates body fields that
// are not array-nested; such a value stays its real captured literal instead of being guessed at.
function isArrayNestedPath(path: string): boolean {
  return path.includes("[*]");
}

/** Returns a copy of `obj` with the value at a non-array "$.a.b" path replaced. */
function setAtPath(obj: unknown, path: string, value: unknown): unknown {
  const keys = path
    .replace(/^\$\.?/, "")
    .split(".")
    .filter((k) => k.length > 0);
  if (keys.length === 0) return value;
  const root: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  let cursor = root;
  for (const key of keys.slice(0, -1)) {
    cursor[key] = { ...(cursor[key] as Record<string, unknown>) };
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1] as string] = value;
  return root;
}

export function generateTestSpecFromSession(store: Store, compositionId: string): GenerateFromSessionResult {
  const composition = store.compositions.get(compositionId);
  if (!composition) throw new Error(`composition ${compositionId} not found`);
  if (composition.status !== "approved") {
    throw new Error(`composition ${compositionId} is ${composition.status}; only approved compositions become tests`);
  }
  const sessionId = composition.sourceSessionId;
  if (!sessionId) {
    throw new Error(`composition ${compositionId} has no sourceSessionId; use generateTestSpec instead`);
  }
  const session = store.sessions.get(sessionId);
  if (!session) throw new Error(`session ${sessionId} not found`);

  const dir = join(dataDir(), "sessions", sessionId);
  const callsByCorrelation = new Map(
    pairCalls(loadCuratedOrRawSession(dir)).map((c) => [c.correlationId, c] as const),
  );
  const operationsById = new Map(store.operations.list().map((o) => [o.operationId, o]));
  const annotationsById = new Map(store.annotations.list().map((a) => [a.operationId, a]));
  const dependencyGraph = computeDependencyGraph(store);

  const stepIdByCorrelation = new Map(
    composition.steps.map((s, i) => [s.sourceCorrelationId as string, `step${i}`] as const),
  );

  // Only edges we can actually express are usable:
  //  - both ends must be steps of THIS Composition (an edge to/from a call the analyst deleted, or
  //    left out, can't be templated — its consumer keeps the real literal); and
  //  - the producer must be a response BODY value, because a TestSpec `extract` is a JSONPath into
  //    the response body (runtime.ts). A response-header producer (e.g. Set-Cookie) can't be
  //    extracted, so its consumer is left as-is / dropped.
  const edges = store
    .sessionGraphs.listBySession(sessionId)
    .filter(
      (e) =>
        e.producerLocation === "responseBody" &&
        stepIdByCorrelation.has(e.producerCorrelationId) &&
        stepIdByCorrelation.has(e.consumerCorrelationId),
    );
  // consumerCorrelationId -> "<location>\0<jsonPath>" -> edge. Path/query jsonPaths are the bare
  // param/query name; requestBody paths are "$.a.b"; header paths are the header name as recorded
  // (or "Cookie.<name>" for a decomposed cookie — see dataflow.ts collectConsumers).
  const edgeByConsumer = new Map<string, Map<string, SessionCallEdge>>();
  for (const e of edges) {
    const forCall = edgeByConsumer.get(e.consumerCorrelationId) ?? new Map<string, SessionCallEdge>();
    forCall.set(`${e.consumerLocation}\u0000${e.consumerJsonPath}`, e);
    edgeByConsumer.set(e.consumerCorrelationId, forCall);
  }

  const registry = new ExtractRegistry();
  function templateRef(edge: SessionCallEdge): string {
    const producerStepId = stepIdByCorrelation.get(edge.producerCorrelationId) as string;
    return `{{steps.${producerStepId}.extract.${registry.varFor(producerStepId, edge.producerJsonPath)}}}`;
  }

  const steps: TestSpecStep[] = composition.steps.map((compStep, i) => {
    const correlationId = compStep.sourceCorrelationId;
    if (!correlationId) throw new Error(`step ${i} of composition ${compositionId} has no sourceCorrelationId`);
    const call = callsByCorrelation.get(correlationId);
    if (!call) {
      throw new Error(`call ${correlationId} not found in session ${sessionId} (deleted after this composition was proposed?)`);
    }
    const stepId = `step${i}`;
    const edgesForCall = edgeByConsumer.get(correlationId);
    const edgeAt = (location: SessionCallEdge["consumerLocation"], jsonPath: string) =>
      edgesForCall?.get(`${location}\u0000${jsonPath}`);

    const pathParams: Record<string, string> = {};
    for (const param of operationsById.get(compStep.operationId)?.pathTemplate.params ?? []) {
      const literal = call.segments[param.position];
      if (literal === undefined) continue;
      const edge = edgeAt("path", param.name);
      pathParams[param.name] = edge ? templateRef(edge) : literal;
    }

    const query: Record<string, string> = {};
    for (const [name, literal] of call.query) {
      const edge = edgeAt("query", name);
      query[name] = edge ? templateRef(edge) : literal;
    }

    // Headers are NEVER copied verbatim: ADR-0006 captures them with live credentials, and auth is
    // supplied at run time from the spec's authProfile anyway. Only a header whose value provably
    // came from an earlier response body is kept, as a template. Cookie edges are skipped for the
    // same auth reason.
    const headers: Record<string, string> = {};
    for (const [key, edge] of edgesForCall ?? []) {
      if (!key.startsWith("requestHeader\u0000")) continue;
      const name = key.slice("requestHeader\u0000".length);
      if (name.startsWith("Cookie.")) continue;
      headers[name] = templateRef(edge);
    }

    // Body only, per the spec: a client-generated value (no producer anywhere in the corpus, minted
    // fresh by the client each time) must not be replayed as the recorded literal.
    const clientGenerated = dependencyGraph.byOperation.get(compStep.operationId)?.clientGenerated ?? [];
    let body: unknown = call.requestBody ?? undefined;
    // Only a parsed JSON object/array is templated. A raw string (e.g. form-encoded) is a single "$"
    // leaf, and replacing it wholesale would destroy the body, so non-objects stay as recorded.
    if (typeof body === "object" && body !== null) {
      for (const leaf of walkScalars(body)) {
        if (isArrayNestedPath(leaf.path)) continue;
        const edge = edgeAt("requestBody", leaf.path);
        if (edge) body = setAtPath(body, leaf.path, templateRef(edge));
        else if (clientGenerated.includes(leaf.path)) body = setAtPath(body, leaf.path, "{{faker.uuid}}");
      }
    }

    // Declare `extract` for every edge where THIS call is the producer, whether or not a consumer's
    // templateRef has asked for it yet — this step is built before its consumers are.
    for (const e of edges) {
      if (e.producerCorrelationId === correlationId) registry.varFor(stepId, e.producerJsonPath);
    }

    const extract = registry.extractFor(stepId);
    const request = {
      ...(Object.keys(pathParams).length > 0 ? { pathParams } : {}),
      ...(Object.keys(query).length > 0 ? { query } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(body !== undefined ? { body } : {}),
    };
    return {
      id: stepId,
      operationId: compStep.operationId,
      description: annotationsById.get(compStep.operationId)?.does ?? `${call.method} ${call.pathname}`,
      request,
      ...(extract ? { extract } : {}),
      expect: { status: call.status ?? 0, schemaConformance: true, jsonAssertions: [] },
      continueOnFailure: false,
    };
  });

  const specId = newId();
  const spec = TestSpecSchema.parse({
    version: 1,
    specId,
    compositionId,
    title: composition.goal,
    environment: composition.testDecision?.environments[0] ?? "staging",
    authProfile: session.meta.authProfile ?? "default",
    tags: ["from-session"],
    steps,
    cleanup: [],
  });

  const operations = store.operations.list();
  const errors = validateSpec(spec, {
    validOperationIds: new Set(operations.map((o) => o.operationId)),
    operationMethods: Object.fromEntries(operations.map((o) => [o.operationId, o.method])),
  });
  const valid = errors.length === 0;

  store.specs.upsert({
    specId,
    compositionId,
    yaml: dumpYaml(spec),
    generatedBy: "session-replay",
    model: null,
    packId: null,
    createdAt: Date.now(),
    status: valid ? "generated" : "invalid",
  });

  return { specId, spec, valid, errors };
}
