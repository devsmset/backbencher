import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "@backbencher/shared";
import type { DerivationResult } from "./types.js";

// persist pass (architecture §5.1). Phase 3 writes JSON artifacts under data/derived; Phase 4
// re-points this at the Drizzle store (full-replace per derive run inside a transaction).

export interface PersistPaths {
  dir: string;
  operations: string;
  dataflow: string;
  flows: string;
  clientGenerated: string;
}

export function persistDerivation(
  result: DerivationResult,
  outDir: string = join(dataDir(), "derived"),
): PersistPaths {
  mkdirSync(outDir, { recursive: true });
  const write = (name: string, data: unknown): string => {
    const p = join(outDir, name);
    writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
    return p;
  };
  return {
    dir: outDir,
    operations: write("operations.json", result.operations),
    dataflow: write("dataflow.json", result.dataflow),
    flows: write("flows.json", result.flows),
    clientGenerated: write("client-generated.json", result.clientGeneratedFields),
  };
}
