#!/usr/bin/env node
// Enforces the dependency direction from architecture §1.1:
//   schemas ← shared ← {recorder, derive, store} ← {portal-api, agent, testkit} ← cli
//   portal-web depends only on schemas + portal-api (router type import).
//   Exception: portal-api also depends on recorder directly, so the dashboard can
//   start/stop a recording session (a local headed browser) without going through the CLI.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {Record<string, string[]>} allowed internal deps per package */
const allowed = {
  "@backbencher/schemas": [],
  "@backbencher/shared": ["@backbencher/schemas"],
  "@backbencher/recorder": ["@backbencher/schemas", "@backbencher/shared"],
  "@backbencher/derive": ["@backbencher/schemas", "@backbencher/shared"],
  "@backbencher/store": ["@backbencher/schemas", "@backbencher/shared"],
  "@backbencher/portal-api": [
    "@backbencher/schemas",
    "@backbencher/shared",
    "@backbencher/store",
    "@backbencher/derive",
    "@backbencher/recorder",
    "@backbencher/agent",
    "@backbencher/testkit",
  ],
  "@backbencher/agent": ["@backbencher/schemas", "@backbencher/shared", "@backbencher/store"],
  "@backbencher/testkit": ["@backbencher/schemas", "@backbencher/shared", "@backbencher/store"],
  "@backbencher/portal-web": ["@backbencher/schemas", "@backbencher/portal-api"],
  "@backbencher/cli": [
    "@backbencher/schemas",
    "@backbencher/shared",
    "@backbencher/recorder",
    "@backbencher/derive",
    "@backbencher/store",
    "@backbencher/portal-api",
    "@backbencher/agent",
    "@backbencher/testkit",
  ],
};

const dirs = [];
for (const base of ["packages", "apps"]) {
  const b = join(root, base);
  if (!existsSync(b)) continue;
  for (const d of readdirSync(b, { withFileTypes: true })) {
    if (d.isDirectory()) dirs.push(join(b, d.name));
  }
}

let failed = false;
for (const dir of dirs) {
  const pjPath = join(dir, "package.json");
  if (!existsSync(pjPath)) continue;
  const pj = JSON.parse(readFileSync(pjPath, "utf8"));
  const name = pj.name;
  const deps = { ...(pj.dependencies ?? {}), ...(pj.devDependencies ?? {}) };
  const internal = Object.keys(deps).filter((d) => d.startsWith("@backbencher/"));
  const allow = allowed[name];
  if (!allow) {
    console.error(`depcheck: unknown workspace package "${name}" (${pjPath})`);
    failed = true;
    continue;
  }
  for (const dep of internal) {
    if (!allow.includes(dep)) {
      console.error(`depcheck: "${name}" may NOT depend on "${dep}" (violates §1.1 direction)`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("\ndepcheck FAILED");
  process.exit(1);
}
console.log("depcheck OK");
