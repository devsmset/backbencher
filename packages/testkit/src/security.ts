import { type Operation, type TestSpec, TestSpecSchema } from "@backbencher/schemas";

// Near-free, compiler-level security generators (architecture §7.5). No LLM: driven purely by
// pack/operation data. Analysts review the emitted specs before running.

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function pathParamValues(op: Operation, override?: (name: string) => string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of op.pathTemplate.params) {
    out[p.name] = override?.(p.name) ?? p.observedValues[0] ?? `{{env.PARAM_${p.name.toUpperCase()}}}`;
  }
  return out;
}

export interface AuthzMatrixOptions {
  operations: Operation[];
  roles: string[];
  environment: string;
  expectStatuses?: number[];
}

/** For each state-changing operation × each role, a spec that replays it expecting denial. */
export function generateAuthzMatrix(opts: AuthzMatrixOptions): TestSpec[] {
  const expectStatuses = opts.expectStatuses ?? [401, 403];
  const specs: TestSpec[] = [];
  for (const op of opts.operations) {
    if (!WRITE_METHODS.has(op.method.toUpperCase())) continue;
    for (const role of opts.roles) {
      const pp = pathParamValues(op);
      specs.push(
        TestSpecSchema.parse({
          version: 1,
          specId: `authz-${op.operationId}-${role}`,
          scenarioId: `authz:${op.operationId}`,
          title: `authz: ${op.method} ${op.pathTemplate.template} as "${role}" should be denied`,
          environment: opts.environment,
          authProfile: role,
          tags: ["authz", "security", "generated"],
          steps: [
            {
              id: "attempt",
              operationId: op.operationId,
              description: `replay ${op.method} ${op.pathTemplate.template} as role "${role}", expecting denial`,
              ...(Object.keys(pp).length > 0 ? { request: { pathParams: pp } } : {}),
              expect: { status: expectStatuses, schemaConformance: false },
            },
          ],
          cleanup: [],
        }),
      );
    }
  }
  return specs;
}

export interface BolaOptions {
  operations: Operation[];
  roles: string[];
  environment: string;
  expectStatuses?: number[];
}

/** For each operation with a resource id in the path × each role, an IDOR probe: access a
 * foreign resource id (supplied at run time via env) under that role, expecting non-200. */
export function generateBolaProbes(opts: BolaOptions): TestSpec[] {
  const expectStatuses = opts.expectStatuses ?? [401, 403, 404];
  const specs: TestSpec[] = [];
  for (const op of opts.operations) {
    const idParam = op.pathTemplate.params[0];
    if (!idParam) continue; // BOLA needs a resource id in the path
    for (const attacker of opts.roles) {
      const pp = pathParamValues(op, (name) => (name === idParam.name ? "{{env.BOLA_TARGET_ID}}" : undefined));
      specs.push(
        TestSpecSchema.parse({
          version: 1,
          specId: `bola-${op.operationId}-${attacker}`,
          scenarioId: `bola:${op.operationId}`,
          title: `BOLA/IDOR: "${attacker}" accessing a foreign ${idParam.name} should be denied`,
          environment: opts.environment,
          authProfile: attacker,
          tags: ["bola", "idor", "security", "generated"],
          steps: [
            {
              id: "probe",
              operationId: op.operationId,
              description: `as "${attacker}", target a foreign ${idParam.name} ({{env.BOLA_TARGET_ID}}), expecting non-200`,
              request: { pathParams: pp },
              expect: { status: expectStatuses, schemaConformance: false },
            },
          ],
          cleanup: [],
        }),
      );
    }
  }
  return specs;
}
