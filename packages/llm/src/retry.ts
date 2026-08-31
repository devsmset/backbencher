import { isRetryableError } from "./errors.js";

export interface RetryOptions {
  readonly maxRetries: number;
  readonly timeoutMs: number;
  readonly baseDelayMs?: number;
  readonly signal?: AbortSignal;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function combineSignals(timeoutMs: number, caller?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return caller ? AbortSignal.any([timeout, caller]) : timeout;
}

/**
 * Bounded exponential backoff with full jitter around a single LLM call. Wraps the adapter seam so
 * every provider inherits it; local models are slow, so the timeout is generous by default.
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const base = opts.baseDelayMs ?? 500;
  const sleep = opts.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn(combineSignals(opts.timeoutMs, opts.signal));
    } catch (err) {
      lastError = err;
      if (opts.signal?.aborted) throw err;
      if (attempt === opts.maxRetries || !isRetryableError(err)) throw err;
      await sleep(Math.random() * base * 2 ** attempt);
    }
  }
  throw lastError;
}
