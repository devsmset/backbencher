export interface LlmErrorOptions {
  readonly retryable?: boolean;
  readonly status?: number;
  readonly cause?: unknown;
}

export class LlmError extends Error {
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(message: string, opts: LlmErrorOptions = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "LlmError";
    this.retryable = opts.retryable ?? false;
    this.status = opts.status;
  }
}

/** The configured model cannot do what the task requires (e.g. constrained JSON, or embeddings). */
export class LlmCapabilityError extends LlmError {
  constructor(message: string) {
    super(message, { retryable: false });
    this.name = "LlmCapabilityError";
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const RETRYABLE_CODES = ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "EPIPE"];

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

/** Network faults and timeouts are retryable; anything else is assumed to be our fault. */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof LlmError) return err.retryable;
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return true;
    const code = (err as NodeJS.ErrnoException).code;
    if (code && RETRYABLE_CODES.includes(code)) return true;
    if (err.message.includes("fetch failed")) return true;
    if (isRetryableError(err.cause)) return true;
  }
  return false;
}
