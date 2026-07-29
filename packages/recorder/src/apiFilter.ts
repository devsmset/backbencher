import type { ApiFilterConfig } from "@backbencher/shared";

// Deterministic API-call filter (architecture §3.2). Decides which network requests to record.

function hostMatches(pattern: string, host: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".otxlab.net"
    return host.endsWith(suffix) || host === pattern.slice(2);
  }
  return false;
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
