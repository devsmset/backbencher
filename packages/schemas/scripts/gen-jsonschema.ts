import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { schemaRegistry } from "../src/index.js";

// Emits JSON Schema for every top-level contract, for non-TS consumers (LLM prompt, external
// tools). Architecture §0: "generated JSON Schema for non-TS consumers".

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "generated", "jsonschema");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let count = 0;
for (const [name, schema] of Object.entries(schemaRegistry)) {
  const json = zodToJsonSchema(schema, name);
  writeFileSync(join(outDir, `${name}.schema.json`), `${JSON.stringify(json, null, 2)}\n`);
  count += 1;
  process.stdout.write(`wrote ${name}.schema.json\n`);
}
process.stdout.write(`\n${count} JSON Schema file(s) written to ${outDir}\n`);
