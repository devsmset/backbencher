import type { ApiFilterConfig } from "@backbencher/shared";

// Deterministic API-call filter (architecture §3.2). Decides which network requests to record.

const ASSET_PATH_RE = /\.(?:svg|woff2?|ttf|otf|eot|ico|png|jpe?g|gif|webp|avif)(?:$|[?#])/i;

function hostMatches(pattern: string, host: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".otxlab.net"
    return host.endsWith(suffix) || host === pattern.slice(2);
  }
  return false;
}

function matchesContentType(pattern: string, contentType: string): boolean {
  const normalizedPattern = pattern.toLowerCase();
  const normalizedType = contentType.toLowerCase();
  return normalizedType.startsWith(normalizedPattern);
}

export function shouldDropCapturedResponse(
  cfg: ApiFilterConfig,
  url: string,
  headers: Record<string, string>,
  resourceType: string,
): boolean {
  const contentType = headers["content-type"] ?? "";
  // A top-level navigation that renders markup is a page, not an API call (ADR-0004). Scoped to
  // `document` so an XHR answering with an HTML error page — how session expiry usually surfaces —
  // is still recorded.
  if (resourceType === "document" && matchesContentType("text/html", contentType)) return true;
  if (cfg.dropContentTypes.some((pattern) => matchesContentType(pattern, contentType))) {
    return true;
  }
  try {
    return ASSET_PATH_RE.test(new URL(url).pathname);
  } catch {
    return ASSET_PATH_RE.test(url);
  }
}

export interface ApiFilter {
  matches(method: string, url: string, resourceType: string): boolean;
}

export function makeApiFilter(cfg: ApiFilterConfig): ApiFilter {
  const dropMethods = new Set(cfg.dropMethods.map((m) => m.toUpperCase()));
  const dropPath = cfg.dropPathPatterns.map((p) => new RegExp(p));
  const resTypes = new Set(cfg.resourceTypes);

  return {
    matches(method, url, resourceType) {
      if (dropMethods.has(method.toUpperCase())) return false;
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        return false;
      }
      if (ASSET_PATH_RE.test(u.pathname)) return false;
      if (cfg.hostAllowlist.length > 0 && !cfg.hostAllowlist.some((h) => hostMatches(h, u.hostname))) {
        return false;
      }
      if (dropPath.some((re) => re.test(u.pathname))) return false;

      const typeAllowed = resTypes.has(resourceType);
      const pathAllowed =
        cfg.pathAllowPatterns.length > 0 &&
        cfg.pathAllowPatterns.some((p) => u.pathname.includes(p) || url.includes(p));

      // With no positive filters configured, record everything that survived the drop rules.
      if (cfg.pathAllowPatterns.length === 0 && resTypes.size === 0) return true;
      return typeAllowed || pathAllowed;
    },
  };
}
