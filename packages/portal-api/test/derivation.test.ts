import type { Operation } from "@backbencher/schemas";
import { openStore } from "@backbencher/store";
import { describe, expect, it, vi } from "vitest";
import { apiCall, makeSession, resetClock } from "../../derive/fixtures/sessions.js";
import { derivationState, runDerivationJob, waitForDerivationIdle } from "../src/derivationJob.js";

const previousDerivation: Operation = {
  operationId: "op_previous",
  method: "GET",
  host: "h",
  pathTemplate: { template: "/api/previous", params: [] },
  observedCount: 1,
  statusCodesObserved: { "200": 1 },
  requestSchema: null,
  responseSchemas: {},
  queryParams: [],
  authObserved: "none",
  contentTypes: ["application/json"],
  exampleCorrelationIds: ["c-prev"],
  firstSeenSessionId: "s-prev",
  lastSeenAt: 1,
  volatileResponseFields: [],
};

describe("derivation job", () => {
  it("runs to completion and reports idle", async () => {
    const store = openStore(":memory:");
    runDerivationJob(store, "alice");
    expect(derivationState().status).toBe("running");
    await waitForDerivationIdle();
    expect(derivationState().status).toBe("idle");
    store.close();
  });

  it("keeps the previous derivation when a curated-file write fails", async () => {
    const store = openStore(":memory:");
    store.saveDerivation({ operations: [previousDerivation], dataflow: [], flows: [] });
    const logError = vi.fn();

    resetClock();
    const session = makeSession("sess-failure", [
      ...apiCall("c1", { url: "https://app.example.net/api/current", body: { ok: true } }),
    ]);

    try {
      runDerivationJob(store, "alice", {
        loadAllSessions: () => [session],
        writeCuratedEvents: () => {
          throw new Error("curated write failed");
        },
        logError,
      });

      await waitForDerivationIdle();

      expect(derivationState()).toMatchObject({ status: "failed", error: "curated write failed" });
      expect(store.operations.list()).toHaveLength(1);
      expect(store.operations.get("op_previous")?.pathTemplate.template).toBe("/api/previous");
      expect(store.audit.list("derivation", "all")).toHaveLength(0);
      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    } finally {
      store.close();
    }
  });

  it("returns to the caller before the derivation body runs", async () => {
    const store = openStore(":memory:");
    const order: string[] = [];

    // Mirrors what sessions.stopRecording does: kick the job off, then let its own async
    // continuation (the mutation's return path, which is what flushes the response) run.
    async function stopRecordingLike(): Promise<void> {
      runDerivationJob(store, "alice", {
        loadAllSessions: () => {
          order.push("derivation");
          return [];
        },
        logError: () => {},
      });
      await Promise.resolve();
      order.push("response");
    }

    await stopRecordingLike();
    expect(order).toEqual(["response"]);

    await waitForDerivationIdle();
    expect(order).toEqual(["response", "derivation"]);
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