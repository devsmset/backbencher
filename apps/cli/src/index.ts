#!/usr/bin/env node
// @backbencher/cli — single `bb` entrypoint (architecture §1.2).
// Subcommands are filled in across phases; Phase 0 provides the dispatcher + help.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { childLogger, dataDir, findRepoRoot, loadConfig, newId } from "@backbencher/shared";

const log = childLogger({ mod: "cli" });

const VERSION = "0.0.0";

const HELP = `bb — backbencher CLI (v${VERSION})

Usage: bb <command> [options]

Commands:
  record [--url <u>] [--profile <p>] [--name <n>] [--goal <g>]  Record a browser session
                                                                (name and goal are required; you are
                                                                 prompted for them when you stop)
  derive [--probe --env <n>]                                Re-derive every session
  embed [--rebuild]                                         Embed the catalog for retrieval
                                                            (also a smoke test of llm.tasks.embed)
  serve  [--port 4000]                                      Start portal-api + portal-web
  agent generate --composition <id>                         Generate a TestSpec via the QA agent
  test compile --spec <file|dir>                            Compile TestSpec(s) to Playwright
  test run [--env <name>] [--grep <pattern>]                Run compiled tests
  security authz|bola [--env <name>]                        Generate authz / BOLA security specs
  export knowledge-pack [--out <dir>]                       Export a knowledge pack

Global:
  -h, --help       Show this help
  -v, --version    Show version
`;

function getFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

async function cmdRecord(argv: string[]): Promise<void> {
  const { startRecording } = await import("@backbencher/recorder");
  const config = loadConfig();
  const url = getFlag(argv, "--url") ?? config.recorder.defaultUrl ?? undefined;
  if (!url) {
    process.stderr.write("record requires --url (or recorder.defaultUrl in bb.config.jsonc)\n");
    process.exitCode = 1;
    return;
  }

  const authProfile = getFlag(argv, "--profile");
  const handle = await startRecording({
    url,
    config,
    headless: false,
    ...(authProfile ? { authProfile } : {}),
  });

  process.stdout.write(
    `\n🎥 Recording ${handle.sessionId}\n` +
      "   Use the opened browser window. Press ENTER to stop & save.\n\n",
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, (answer) => resolve(answer.trim())));

  let finishing = false;
  const finish = async (): Promise<void> => {
    if (finishing) return;
    finishing = true;

    // The analyst's own words are the highest-signal text in the corpus, and cannot be
    // reconstructed later — so a session is not saved until both are given.
    let name = getFlag(argv, "--name") ?? getFlag(argv, "--session-name") ?? "";
    let goal = getFlag(argv, "--goal") ?? "";
    process.stdout.write("\n");
    while (!name) {
      name = await ask("Session name (e.g. \"Create ticket from homepage\"), or 'discard': ");
      if (name.toLowerCase() === "discard") {
        rl.close();
        await handle.discard();
        process.stdout.write("🗑️  Discarded — nothing saved.\n");
        process.exit(0);
      }
    }
    while (!goal) {
      goal = await ask('Goal — what were you doing, in your words? ');
    }
    rl.close();

    const result = await handle.stop({ name, goal });
    const counts = Object.entries(result.summary.eventCounts)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    process.stdout.write(
      `\n✅ Saved ${result.summary.totalEvents} events to ${result.sessionDir}\n` +
        `   ${counts}\n   warnings=${result.summary.warnings}\n`,
    );
    process.stdout.write("⚙️  Deriving…\n");
    await cmdDerive([]);
    process.exit(0);
  };

  rl.on("line", () => void finish());
  process.on("SIGINT", () => void finish());
}

async function cmdEmbed(argv: string[]): Promise<void> {
  const { openStore } = await import("@backbencher/store");
  const { createEmbedder, warmEmbeddings } = await import("@backbencher/agent");
  const config = loadConfig();
  const store = openStore();
  if (argv.includes("--rebuild")) store.embeddings.clear();

  try {
    const embedder = createEmbedder(config);
    const res = await warmEmbeddings(store, embedder);
    process.stdout.write(
      `✅ Embeddings up to date with ${embedder.model}\n` +
        `   ready operations=${res.operations}, referenceSessions=${res.referenceSessions}, newly embedded=${res.embedded}\n`,
    );
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exitCode = 1;
  } finally {
    store.close();
  }
}

async function cmdDerive(argv: string[]): Promise<void> {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(HELP);
    return;
  }
  const { loadAllSessions, runDerivation, writeCuratedEvents } = await import("@backbencher/derive");
  const { openStore } = await import("@backbencher/store");
  const sessions = loadAllSessions();
  if (sessions.length === 0) {
    process.stderr.write("no sessions found under data/sessions (run `bb record` first)\n");
    process.exitCode = 1;
    return;
  }
  const store = openStore();
  const result = runDerivation(sessions, { deletedCorrelationIds: store.sessionCuration.deletionMap() });
  for (const s of sessions) store.sessions.upsertFromMeta(s.meta);

  let operations = result.operations;
  if (argv.includes("--probe")) {
    const { probeVolatileFields } = await import("@backbencher/derive");
    const config = loadConfig();
    const envName = getFlag(argv, "--env");
    const env = envName ? config.environments.find((e) => e.name === envName) : config.environments[0];
    if (!env) {
      process.stderr.write("--probe requires a configured environment (bb.config.jsonc / --env)\n");
    } else {
      const safe = new Set(store.testingAnnotations.list().filter((a) => a.tags.includes("probe-safe")).map((a) => a.operationId));
      const http = async ({ url }: { method: string; url: string }) => {
        const res = await fetch(url);
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        return { status: res.status, body };
      };
      operations = await probeVolatileFields(operations, { baseUrl: env.baseUrl, http, safeOperationIds: safe });
      process.stdout.write(`\ud83d\udd0e Probed ${safe.size} probe-safe operation(s) against ${env.name}\n`);
    }
  }
  store.saveDerivation({ ...result, operations });
  for (const s of sessions) {
    const excluded = new Set(result.autoFiltered[s.meta.sessionId] ?? []);
    for (const id of store.sessionCuration.get(s.meta.sessionId)?.deletedCorrelationIds ?? []) excluded.add(id);
    writeCuratedEvents(join(dataDir(), "sessions", s.meta.sessionId), s, excluded);
  }
  store.close();
  process.stdout.write(
    `\u2705 Derived ${operations.length} operations, ${result.dataflow.length} dataflow edges, ` +
      `${result.flows.length} flows from ${sessions.length} session(s) \u2192 store\n`,
  );
}

async function cmdServe(argv: string[]): Promise<void> {
  const { startServer } = await import("@backbencher/portal-api");
  const port = Number(getFlag(argv, "--port") ?? 4000);
  const staticDir = join(findRepoRoot(), "packages", "portal-web", "dist");
  if (!existsSync(join(staticDir, "index.html"))) {
    process.stdout.write(
      `\u26a0\ufe0f  portal-web is not built — serving API only.\n   Run \`pnpm build\` (or \`pnpm --filter @backbencher/portal-web build\`), then reload.\n`,
    );
  }
  await startServer(port, { staticDir });
  process.stdout.write(`\ud83c\udf10 Portal on http://localhost:${port}  (UI at /, tRPC at /trpc)\n`);
}

async function cmdExport(argv: string[]): Promise<void> {
  if (argv[1] !== "knowledge-pack") {
    process.stderr.write("usage: bb export knowledge-pack [--out <dir>]\n");
    process.exitCode = 1;
    return;
  }
  const { openStore } = await import("@backbencher/store");
  const { buildKnowledgePack } = await import("@backbencher/agent");
  const out = getFlag(argv, "--out");
  const store = openStore();
  const result = buildKnowledgePack(store, out ? { outDir: out } : {});
  store.close();
  process.stdout.write(
    `\u2705 Knowledge pack ${result.pack.contentHash} (${result.pack.catalog.length} operations) \u2192 ${result.dir}\n`,
  );
}

async function cmdAgent(argv: string[]): Promise<void> {
  if (argv[1] !== "generate") {
    process.stderr.write("usage: bb agent generate --composition <id> [--model <m>] [--provider anthropic|vertex]\n");
    process.exitCode = 1;
    return;
  }
  const compositionId = getFlag(argv, "--composition");
  if (!compositionId) {
    process.stderr.write("agent generate requires --composition <id>\n");
    process.exitCode = 1;
    return;
  }
  const { openStore } = await import("@backbencher/store");
  const { generateTestSpec, createLlm } = await import("@backbencher/agent");
  const config = loadConfig();
  const model = getFlag(argv, "--model");
  const providerFlag = getFlag(argv, "--provider");
  const provider = providerFlag === "vertex" || providerFlag === "anthropic" ? providerFlag : config.agent.provider;
  const cfg = { ...config, agent: { ...config.agent, provider } };

  let llm: import("@backbencher/agent").LlmComplete;
  try {
    llm = createLlm(cfg, "generateSpec", model);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exitCode = 1;
    return;
  }

  const store = openStore();
  const res = await generateTestSpec(store, compositionId, { llm, ...(model ? { model } : {}) });
  store.close();
  if (res.valid) {
    process.stdout.write(`\u2705 Generated spec ${res.specId} (${res.attempts} attempt(s))\n`);
  } else {
    process.stderr.write(`\u26a0\ufe0f  Spec ${res.specId} INVALID:\n${res.errors.map((e) => `  - ${e}`).join("\n")}\n`);
    process.exitCode = 1;
  }
}

async function cmdTest(argv: string[]): Promise<void> {
  const sub = argv[1];
  const { openStore } = await import("@backbencher/store");
  const { compileSpecFile, buildCompileContext, loadSpecYaml, runSpecAgainstEnv } = await import(
    "@backbencher/testkit"
  );
  const store = openStore();
  try {
    if (sub === "compile") {
      const specId = getFlag(argv, "--spec");
      if (!specId) {
        process.stderr.write("bb test compile requires --spec <specId>\n");
        process.exitCode = 1;
        return;
      }
      const row = store.specs.get(specId);
      if (!row) {
        process.stderr.write(`spec ${specId} not found\n`);
        process.exitCode = 1;
        return;
      }
      const spec = loadSpecYaml(row.yaml);
      const path = compileSpecFile(spec, buildCompileContext(store, spec), join(dataDir(), "generated-tests"));
      process.stdout.write(`\u2705 Compiled \u2192 ${path}\n`);
    } else if (sub === "run") {
      const config = loadConfig();
      const envName = getFlag(argv, "--env");
      const env = envName ? config.environments.find((e) => e.name === envName) : config.environments[0];
      if (!env) {
        process.stderr.write("no environment configured in bb.config.jsonc\n");
        process.exitCode = 1;
        return;
      }
      const specId = getFlag(argv, "--spec");
      const grep = getFlag(argv, "--grep");
      let rows = specId ? [store.specs.get(specId)] : store.specs.list();
      if (grep) rows = rows.filter((r) => r && r.specId.includes(grep));
      const runnable = rows.filter((r): r is NonNullable<typeof r> => r !== null);
      if (runnable.length === 0) {
        process.stderr.write("no specs to run\n");
        process.exitCode = 1;
        return;
      }
      let passed = 0;
      let flaky = 0;
      let failed = 0;
      for (const row of runnable) {
        const spec = loadSpecYaml(row.yaml);
        const runId = newId();
        store.runs.insert({ runId, specId: row.specId, env: env.name, startedAt: Date.now(), finishedAt: null, status: "running", report: null });
        try {
          const q = await runSpecAgainstEnv(store, spec, { name: env.name, baseUrl: env.baseUrl, destructive: env.destructive });
          store.runs.finish(runId, q.status, q.result);
          if (q.status === "passed") passed += 1;
          else if (q.status === "flaky") flaky += 1;
          else failed += 1;
          process.stdout.write(`  ${q.status.toUpperCase()} ${row.specId}\n`);
        } catch (e) {
          store.runs.finish(runId, "failed", { error: String(e) });
          failed += 1;
          process.stdout.write(`  FAILED ${row.specId} (${String(e)})\n`);
        }
      }
      process.stdout.write(`\n${passed} passed, ${flaky} flaky, ${failed} failed\n`);
      if (failed > 0) process.exitCode = 1;
    } else {
      process.stderr.write("usage: bb test compile --spec <id> | bb test run [--env <name>] [--spec <id>] [--grep <p>]\n");
      process.exitCode = 1;
    }
  } finally {
    store.close();
  }
}

async function cmdSecurity(argv: string[]): Promise<void> {
  const sub = argv[1];
  if (sub !== "authz" && sub !== "bola") {
    process.stderr.write("usage: bb security authz|bola [--env <name>]\n");
    process.exitCode = 1;
    return;
  }
  const { openStore } = await import("@backbencher/store");
  const { generateAuthzMatrix, generateBolaProbes, specToYaml } = await import("@backbencher/testkit");
  const config = loadConfig();
  const envName = getFlag(argv, "--env");
  const env = envName ? config.environments.find((e) => e.name === envName) : config.environments[0];
  const environment = env?.name ?? "staging";
  const store = openStore();
  const roles = [
    ...new Set(store.sessions.list().map((s) => s.authProfile).filter((r): r is string => Boolean(r))),
  ];
  if (roles.length === 0) {
    process.stderr.write("no auth profiles observed in sessions (record flows per role first)\n");
    store.close();
    process.exitCode = 1;
    return;
  }
  const ops = store.operations.list();
  const specs =
    sub === "authz"
      ? generateAuthzMatrix({ operations: ops, roles, environment })
      : generateBolaProbes({ operations: ops, roles, environment });
  for (const spec of specs) {
    store.specs.upsert({
      specId: spec.specId,
      compositionId: spec.compositionId,
      yaml: specToYaml(spec),
      generatedBy: `${sub}-generator`,
      model: null,
      packId: null,
      createdAt: Date.now(),
      status: "generated",
    });
  }
  store.close();
  process.stdout.write(`✅ Generated ${specs.length} ${sub} spec(s) across roles: ${roles.join(", ")}\n`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (cmd === "-v" || cmd === "--version") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  switch (cmd) {
    case "record":
      await cmdRecord(argv);
      break;
    case "derive":
      await cmdDerive(argv);
      break;
    case "embed":
      await cmdEmbed(argv);
      break;
    case "serve":
      await cmdServe(argv);
      break;
    case "agent":
      await cmdAgent(argv);
      break;
    case "test":
      await cmdTest(argv);
      break;
    case "security":
      await cmdSecurity(argv);
      break;
    case "export":
      await cmdExport(argv);
      break;
    default:
      process.stderr.write(`Unknown command: ${cmd}\n\n`);
      process.stdout.write(HELP);
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  log.error({ err }, "bb failed");
  process.exit(1);
});
