import { describe, expect, it, vi } from "vitest";
import { LlmError } from "../src/errors.js";
import { withRetry } from "../src/retry.js";

const noSleep = () => Promise.resolve();

describe("withRetry", () => {
  it("returns the first successful result without sleeping", async () => {
    const sleep = vi.fn(noSleep);
    const fn = vi.fn(() => Promise.resolve("ok"));
    await expect(withRetry(fn, { maxRetries: 3, timeoutMs: 1000, sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries retryable failures up to maxRetries then rethrows", async () => {
    const fn = vi.fn(() => Promise.reject(new LlmError("rate limited", { status: 429, retryable: true })));
    await expect(withRetry(fn, { maxRetries: 2, timeoutMs: 1000, sleep: noSleep })).rejects.toThrow("rate limited");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable failures", async () => {
    const fn = vi.fn(() => Promise.reject(new LlmError("bad request", { status: 400 })));
    await expect(withRetry(fn, { maxRetries: 3, timeoutMs: 1000, sleep: noSleep })).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("recovers when a retryable failure is followed by success", async () => {
    let calls = 0;
    const fn = vi.fn(() => {
      calls++;
      return calls === 1
        ? Promise.reject(new LlmError("upstream", { status: 503, retryable: true }))
        : Promise.resolve("recovered");
    });
    await expect(withRetry(fn, { maxRetries: 3, timeoutMs: 1000, sleep: noSleep })).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("treats network faults as retryable", async () => {
    const fn = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    await expect(withRetry(fn, { maxRetries: 1, timeoutMs: 1000, sleep: noSleep })).rejects.toThrow("fetch failed");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("stops immediately when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn(() => Promise.reject(new LlmError("upstream", { status: 503, retryable: true })));
    await expect(
      withRetry(fn, { maxRetries: 3, timeoutMs: 1000, sleep: noSleep, signal: controller.signal }),
    ).rejects.toThrow("upstream");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes a signal that aborts at the configured timeout", async () => {
    const fn = vi.fn((signal: AbortSignal) => Promise.resolve(signal.aborted));
    await expect(withRetry(fn, { maxRetries: 0, timeoutMs: 1000, sleep: noSleep })).resolves.toBe(false);
    expect(fn.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
  });
});
