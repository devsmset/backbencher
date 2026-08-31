import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { RecordingEventSchema } from "@backbencher/schemas";
import { BbConfigSchema } from "@backbencher/shared";
import { chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { startFixture } from "../fixtures/app.js";
import { startRecording } from "../src/recorder.js";

// Real e2e: Playwright drives the fixture app while the recorder captures. Verifies events are
// schema-valid and that a typed password never appears anywhere in data/ (both browser-side UI
// redaction and network-body redaction). Skips gracefully if no Chromium is installed.

const hasBrowser = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

const CANARY = "hunter2-canary-PASSWORD-do-not-leak";

const suite = hasBrowser ? describe : describe.skip;

suite("recorder e2e", () => {
  let sessionDir = "";

  afterAll(() => {
    if (sessionDir && existsSync(sessionDir)) rmSync(sessionDir, { recursive: true, force: true });
  });

  it("captures schema-valid events and never leaks a password", async () => {
    const config = BbConfigSchema.parse({
      recorder: {
        apiFilter: { hostAllowlist: [], pathAllowPatterns: ["/api/"], resourceTypes: ["xhr", "fetch"] },
      },
    });

    const fx = await startFixture();
    const handle = await startRecording({ url: fx.url, headless: true, config });
    sessionDir = handle.sessionDir;

    await handle.page.fill("#username", "suite-admin");
    await handle.page.fill("#password", CANARY);
    await Promise.all([
      handle.page.waitForResponse((r) => r.url().includes("/api/login")),
      handle.page.click("#submit"),
    ]);
    await handle.page.waitForTimeout(300);

    const result = await handle.stop({ name: "Fixture login", goal: "log in to the fixture app" });
    await fx.close();

    const lines = readFileSync(result.eventsPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    const events = lines.map((l) => RecordingEventSchema.parse(JSON.parse(l)));

    expect(events.some((e) => e.type === "api_request" && e.url.includes("/api/login"))).toBe(true);
    expect(events.some((e) => e.type === "api_response")).toBe(true);

    for (const f of ["events.ndjson", "meta.json", "summary.json"]) {
      const content = readFileSync(join(result.sessionDir, f), "utf8");
      expect(content).not.toContain(CANARY);
    }
  }, 60000);
});
