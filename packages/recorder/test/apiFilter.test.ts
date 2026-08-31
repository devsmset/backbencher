import { ApiFilterConfigSchema } from "@backbencher/shared";
import { describe, expect, it } from "vitest";
import { makeApiFilter, shouldDropCapturedResponse } from "../src/apiFilter.js";

const cfg = ApiFilterConfigSchema.parse({
  hostAllowlist: ["*.otxlab.net"],
  pathAllowPatterns: ["/api/", "/idm-service/", "/bo/"],
  resourceTypes: ["xhr", "fetch"],
  dropContentTypes: ["image/", "font/", "text/css", "text/javascript"],
  dropPathPatterns: ["/analytics", "/telemetry", "/assets/"],
  dropMethods: ["OPTIONS"],
});

const H = "https://te-smax-qa1-m.otxlab.net";
const filter = makeApiFilter(cfg);

describe("matches", () => {
  it("rejects static assets even when their path is allow-listed", () => {
    expect(filter.matches("GET", `${H}/bo/static/media/Metric-Regular.705b.woff`, "other")).toBe(false);
    expect(filter.matches("GET", `${H}/idm-service/idm/v0/favicon.svg`, "other")).toBe(false);
    expect(filter.matches("GET", `${H}/bo/static/media/logo.png`, "other")).toBe(false);
  });

  it("rejects an asset carrying a query string", () => {
    expect(filter.matches("GET", `${H}/bo/static/media/icon.woff2?v=3`, "other")).toBe(false);
  });

  it("rejects static bundles under /assets/", () => {
    expect(filter.matches("GET", `${H}/idm-service/idm/v0/assets/i18n/en.json`, "xhr")).toBe(false);
  });

  it("accepts real api calls", () => {
    expect(filter.matches("GET", `${H}/bo/rest/entities/tenant?limit=250`, "xhr")).toBe(true);
    expect(filter.matches("POST", `${H}/idm-service/idm/v0/api/public/authenticate`, "xhr")).toBe(true);
  });

  it("accepts a document navigation on an allow-listed path", () => {
    expect(filter.matches("POST", `${H}/bo/boLogin`, "document")).toBe(true);
  });
});

describe("shouldDropCapturedResponse", () => {
  const html = { "content-type": "text/html; charset=utf-8" };

  it("drops a document navigation that renders html", () => {
    expect(shouldDropCapturedResponse(cfg, `${H}/idm-service/idm/v0/login?tenant=sysbo`, html, "document")).toBe(true);
  });

  it("keeps an xhr that returns html, which is how session expiry surfaces", () => {
    expect(shouldDropCapturedResponse(cfg, `${H}/bo/rest/entities/user`, html, "xhr")).toBe(false);
  });

  it("keeps a redirect hop, which has no content type", () => {
    expect(shouldDropCapturedResponse(cfg, `${H}/bo/postBoLogin?code=abc`, {}, "document")).toBe(false);
  });

  it("keeps a text/plain api response", () => {
    const headers = { "content-type": "text/plain" };
    const url = `${H}/bo/rest/entities/configuration/common/suiteVersion`;
    expect(shouldDropCapturedResponse(cfg, url, headers, "xhr")).toBe(false);
  });

  it("keeps a json api response", () => {
    const headers = { "content-type": "application/json" };
    expect(shouldDropCapturedResponse(cfg, `${H}/bo/userProfile`, headers, "xhr")).toBe(false);
  });

  it("still drops images and fonts by content type", () => {
    expect(shouldDropCapturedResponse(cfg, `${H}/bo/img`, { "content-type": "image/png" }, "other")).toBe(true);
    expect(shouldDropCapturedResponse(cfg, `${H}/bo/f`, { "content-type": "font/woff2" }, "other")).toBe(true);
  });
});
