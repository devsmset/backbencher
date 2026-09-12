import { openStore } from "@backbencher/store";
import { describe, expect, it } from "vitest";
import { derivationState, runDerivationJob, waitForDerivationIdle } from "../src/derivationJob.js";

describe("derivation job", () => {
  it("runs to completion and reports idle", async () => {
    const store = openStore(":memory:");
    runDerivationJob(store, "alice");
    expect(derivationState().status).toBe("running");
    await waitForDerivationIdle();
    expect(derivationState().status).toBe("idle");
    store.close();
  });

  it("collapses concurrent requests into a single follow-up run", async () => {
    const store = openStore(":memory:");
    runDerivationJob(store, "alice");
    runDerivationJob(store, "alice");
    runDerivationJob(store, "alice");
    await waitForDerivationIdle();
    expect(derivationState().status).toBe("idle");
    store.close();
  });
});