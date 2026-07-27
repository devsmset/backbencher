const { test, expect, request } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const catalogPath = path.join(__dirname, "..", "..", "artifacts", "api-catalog", "all-apis.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const methodAllowList = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const safeStatuses = new Set([
  200, 201, 202, 204,
  301, 302, 303, 304, 307, 308,
  400, 401, 403, 404, 405, 409, 410, 412, 415, 422, 429
]);

const maxApis = Number(process.env.MAX_APIS || "50");
const includeMethods = new Set(
  String(process.env.API_METHODS || "GET,POST")
    .split(",")
    .map((m) => m.trim().toUpperCase())
    .filter(Boolean)
);

function selectApis() {
  const source = Array.isArray(catalog.apis) ? catalog.apis : [];
  const filtered = source.filter((api) => {
    const method = String(api.method || "").toUpperCase();
    return methodAllowList.has(method) && includeMethods.has(method);
  });
  return filtered.slice(0, Math.max(1, maxApis));
}

async function performCall(ctx, method, url) {
  if (method === "GET") {
    return ctx.get(url);
  }
  if (method === "POST") {
    return ctx.post(url, { data: {} });
  }
  if (method === "PUT") {
    return ctx.put(url, { data: {} });
  }
  if (method === "PATCH") {
    return ctx.patch(url, { data: {} });
  }
  if (method === "DELETE") {
    return ctx.delete(url);
  }
  if (method === "OPTIONS") {
    return ctx.fetch(url, { method: "OPTIONS" });
  }
  if (method === "HEAD") {
    return ctx.fetch(url, { method: "HEAD" });
  }
  return ctx.fetch(url, { method });
}

test.describe("API catalog smoke checks", () => {
  const selectedApis = selectApis();

  test("catalog has API entries", async () => {
    expect(Array.isArray(catalog.apis)).toBeTruthy();
    expect(catalog.apis.length).toBeGreaterThan(0);
    expect(selectedApis.length).toBeGreaterThan(0);
  });

  for (const api of selectedApis) {
    const method = String(api.method || "").toUpperCase();
    const endpoint = String(api.endpoint || "").trim();
    const sampleUrl = Array.isArray(api.sampleUrls) && api.sampleUrls.length > 0 ? api.sampleUrls[0] : endpoint;

    test(`${method} ${endpoint}`, async () => {
      const ctx = await request.newContext({ ignoreHTTPSErrors: true });
      try {
        const response = await performCall(ctx, method, sampleUrl);
        const status = response.status();

        // Allow expected auth/client responses and fail mainly on server-side or transport issues.
        expect(safeStatuses.has(status), `Unexpected status ${status} for ${method} ${sampleUrl}`).toBeTruthy();
      } catch (error) {
        throw new Error(`Request failed for ${method} ${sampleUrl}: ${error.message}`);
      } finally {
        await ctx.dispose();
      }
    });
  }
});
