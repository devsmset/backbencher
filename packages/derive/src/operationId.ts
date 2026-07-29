import { createHash } from "node:crypto";

// operationId = sha1(method + " " + host + template).slice(0, 12) — stable across re-derivation
// as long as the template is stable (architecture §5.2 step 4).
export function operationId(method: string, host: string, template: string): string {
  return createHash("sha1").update(`${method} ${host}${template}`).digest("hex").slice(0, 12);
}
