// Phase 5 acceptance e2e (architecture §8): an analyst can, end-to-end, view a session →
// document an operation → build a scenario from a flow → approve it → build a pack containing it.
// Standalone script (not a workspace package) so it may import built dist across packages.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildServer } from "../packages/portal-api/dist/index.js";
import { openStore } from "../packages/store/dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4137;
const BASE = `http://127.0.0.1:${PORT}`;

const op = {
  operationId: "op_one",
  method: "GET",
  host: "app.example.net",
  pathTemplate: { template: "/api/one", params: [] },
  observedCount: 2,
  statusCodesObserved: { "200": 2 },
  requestSchema: null,
  responseSchemas: {},
  queryParams: [],
  authObserved: "cookie",
  contentTypes: ["application/json"],
  exampleCorrelationIds: ["c1"],
  firstSeenSessionId: "s1",
  lastSeenAt: Date.now(),
  volatileResponseFields: [],
};

const dbDir = mkdtempSync(join(tmpdir(), "bb-e2e-"));
const store = openStore(join(dbDir, "e2e.db"));
const sessionDir = join(root, "data", "sessions", "s1");

function seed() {
  store.saveDerivation({
    operations: [op],
    dataflow: [],
    flows: [{ flowId: "s1:flow", sessionId: "s1", steps: [{ operationId: "op_one", correlationId: "c1" }] }],
  });
  store.sessions.upsertFromMeta({ version: 4, sessionId: "s1", startUrl: "https://app.example.net/", startedAt: Date.now(), userAgent: "t", recorderVersion: "t" });
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, "meta.json"), JSON.stringify({ version: 4, sessionId: "s1", startUrl: "https://app.example.net/", startedAt: Date.now(), userAgent: "t", recorderVersion: "t" }));
  writeFileSync(
    join(sessionDir, "events.ndjson"),
    `${JSON.stringify({ type: "api_request", correlationId: "c1", timestamp: Date.now(), method: "GET", url: "https://app.example.net/api/one", resourceType: "xhr", headers: {}, headersSource: "all", postData: null })}\n`,
  );
}

async function main() {
  seed();
  const { app } = buildServer({ store, staticDir: join(root, "packages", "portal-web", "dist") });
  await app.listen({ port: PORT, host: "127.0.0.1" });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fail = async (msg) => {
    await page.screenshot({ path: join(dbDir, "fail.png") }).catch(() => {});
    throw new Error(msg);
  };

  try {
    // 1. view a session
    await page.goto(`${BASE}/#/sessions/s1`);
    await page.getByText("Observed flows").waitFor({ timeout: 10000 });
    await page.getByText("s1:flow").waitFor();

    // 2. document an operation (rename)
    await page.goto(`${BASE}/#/op/op_one`);
    await page.getByRole("button", { name: "annotation" }).click();
    await page.getByLabel("Display name").fill("Get One");
    await page.getByRole("button", { name: /Save annotation/ }).click();
    await page.goto(`${BASE}/#/catalog`);
    await page.getByText("Get One").waitFor({ timeout: 10000 });

    // 3 + 4. build a scenario from the flow and approve it
    await page.goto(`${BASE}/#/scenario/${encodeURIComponent("s1:flow")}`);
    await page.getByLabel("Name").fill("Lifecycle");
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByText("Approved").waitFor({ timeout: 10000 });

    // 5. build a pack containing it
    await page.goto(`${BASE}/#/pack`);
    await page.getByRole("button", { name: /Build pack/ }).click();
    await page.getByText(/Built [0-9a-f]{16}/).waitFor({ timeout: 10000 });

    // verify via the store
    const approved = store.scenarios.list().filter((s) => s.reviewState === "approved");
    const packs = store.packs.list();
    if (approved.length < 1) await fail("no approved scenario");
    if (packs.length < 1) await fail("no pack built");
    const displayed = store.annotations.get("op_one")?.displayName;
    if (displayed !== "Get One") await fail(`annotation not saved (got ${displayed})`);

    process.stdout.write(`E2E PASS — pack ${packs[0].contentHash}, approved scenarios ${approved.length}, op renamed "${displayed}"\n`);
  } finally {
    await browser.close();
    await app.close();
    store.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  process.stderr.write(`E2E FAIL: ${err?.stack ?? err}\n`);
  process.exit(1);
});
