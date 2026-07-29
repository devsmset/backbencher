import type { RedactionConfig } from "./config.js";

// Redaction (architecture §3.5). Pure functions; runs at CAPTURE time, never at export time —
// a raw file with secrets must never exist on disk.

function redactHeaderValue(key: string, value: string, cfg: RedactionConfig): string {
  // keepAuthShape: record "Bearer ***REDACTED***" so the auth KIND survives.
  if (cfg.keepAuthShape && /^(authorization|proxy-authorization)$/i.test(key)) {
    const m = /^(\S+)\s+\S/.exec(value);
    if (m?.[1]) return `${m[1]} ${cfg.placeholder}`;
  }
  return cfg.placeholder;
}

// Headers whose values are URLs that may carry secrets in their query string.
const URL_HEADERS = new Set(["referer", "referrer", "location", "content-location", "origin"]);

/** Case-insensitive header denylist. Non-denied headers pass through unchanged, except
 * URL-bearing headers (referer, location, ...) whose denylisted query params are stripped. */
export function redactHeaders(
  headers: Record<string, string>,
  cfg: RedactionConfig,
): Record<string, string> {
  const deny = new Set(cfg.headerDenylist.map((h) => h.toLowerCase()));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (deny.has(lk)) {
      out[k] = redactHeaderValue(k, v, cfg);
    } else if (URL_HEADERS.has(lk)) {
      // referer/location/origin can carry secrets (e.g. ?code=) in their query string.
      out[k] = redactUrl(v, cfg);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Replace denylisted query-param values. Returns the input unchanged if not a valid URL. */
export function redactUrl(rawUrl: string, cfg: RedactionConfig): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  const deny = new Set(cfg.queryParamDenylist.map((p) => p.toLowerCase()));
  const parts: string[] = [];
  let changed = false;
  for (const [key, value] of u.searchParams.entries()) {
    if (deny.has(key.toLowerCase())) {
      parts.push(`${encodeURIComponent(key)}=${cfg.placeholder}`);
      changed = true;
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  if (!changed) return rawUrl;
  u.search = parts.length > 0 ? `?${parts.join("&")}` : "";
  return u.toString();
}

const MAX_DEPTH = 50;

/**
 * Deep-walk a JSON value; any key that case-insensitively contains a denylist term is
 * replaced with the placeholder. Arrays are walked; recursion is depth-capped at 50.
 */
export function redactJsonBody(value: unknown, cfg: RedactionConfig, depth = 0): unknown {
  if (depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactJsonBody(v, cfg, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    const deny = cfg.bodyFieldDenylist.map((f) => f.toLowerCase());
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      out[k] = deny.some((t) => lower.includes(t))
        ? cfg.placeholder
        : redactJsonBody(v, cfg, depth + 1);
    }
    return out;
  }
  return value;
}

/** Redact a raw body string: JSON is parsed → redacted → re-stringified; non-JSON passes through. */
export function redactBodyText(text: string | null, cfg: RedactionConfig): string | null {
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return JSON.stringify(redactJsonBody(parsed, cfg));
  } catch {
    return text;
  }
}
