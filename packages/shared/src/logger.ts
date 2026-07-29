import pino, { type Logger } from "pino";

export const logger: Logger = pino({
  level: process.env.BB_LOG_LEVEL ?? "info",
});

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

export type { Logger };
