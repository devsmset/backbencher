import { describe, expect, it } from "vitest";
import { RedactionConfigSchema } from "../src/config.js";
import { redactBodyText, redactHeaders, redactJsonBody, redactUrl } from "../src/redaction.js";

const cfg = RedactionConfigSchema.parse({});
const CANARY = "eyJhbGciOiJIUzI1NiJ9.super-secret-token.sig";

describe("redactHeaders", () => {
  it("redacts denylisted headers case-insensitively", () => {
    const out = redactHeaders(
      { Cookie: "JSESSIONID=abc", "X-CSRF-Token": "xyz", Accept: "*/*" },
      cfg,
    );
    expect(out.Cookie).toBe("***REDACTED***");
    expect(out["X-CSRF-Token"]).toBe("***REDACTED***");
    expect(out.Accept).toBe("*/*");
  });

  it("keeps the auth scheme when keepAuthShape is on", () => {
    const out = redactHeaders({ authorization: `Bearer ${CANARY}` }, cfg);
    expect(out.authorization).toBe("Bearer ***REDACTED***");
    expect(JSON.stringify(out)).not.toContain(CANARY);
  });

  it("fully redacts auth when keepAuthShape is off", () => {
    const noShape = RedactionConfigSchema.parse({ keepAuthShape: false });
    const out = redactHeaders({ authorization: `Bearer ${CANARY}` }, noShape);
    expect(out.authorization).toBe("***REDACTED***");
  });

  it("strips denylisted query params from URL-bearing headers (referer/location)", () => {
    const out = redactHeaders(
      {
        referer: `https://example.net/login?tenant=sysbo&code=${CANARY}`,
        location: `https://example.net/cb?access_token=${CANARY}`,
      },
      cfg,
    );
    expect(out.referer).toContain("tenant=sysbo");
    expect(out.referer).toContain("code=***REDACTED***");
    expect(JSON.stringify(out)).not.toContain(CANARY);
  });
});

describe("redactUrl", () => {
  it("redacts denylisted query params and preserves the rest", () => {
    const out = redactUrl(
      `https://example.net/idm/token?code=${CANARY}&tenant=sysbo`,
      cfg,
    );
    expect(out).toContain("code=***REDACTED***");
    expect(out).toContain("tenant=sysbo");
    expect(out).not.toContain(CANARY);
  });

  it("returns non-URL input unchanged", () => {
    expect(redactUrl("not a url", cfg)).toBe("not a url");
  });
});

describe("redactJsonBody", () => {
  it("redacts denylisted fields at any depth and walks arrays", () => {
    const out = redactJsonBody(
      {
        username: "suite-admin",
        password: "Admin123",
        nested: [{ clientSecret: CANARY }, { ok: 1 }],
      },
      cfg,
    ) as Record<string, unknown>;
    expect(out.username).toBe("suite-admin");
    expect(out.password).toBe("***REDACTED***");
    expect(JSON.stringify(out)).not.toContain(CANARY);
    expect(JSON.stringify(out)).not.toContain("Admin123");
  });

  it("does not overflow on deeply nested objects", () => {
    let deep: Record<string, unknown> = { password: CANARY };
    for (let i = 0; i < 200; i += 1) deep = { child: deep };
    expect(() => redactJsonBody(deep, cfg)).not.toThrow();
  });
});

describe("redactBodyText", () => {
  it("redacts JSON strings and passes null through", () => {
    const out = redactBodyText(JSON.stringify({ token: CANARY, keep: "yes" }), cfg);
    expect(out).not.toBeNull();
    expect(out).not.toContain(CANARY);
    expect(out).toContain("yes");
    expect(redactBodyText(null, cfg)).toBeNull();
  });

  it("passes non-JSON text through unchanged", () => {
    expect(redactBodyText("plain text body", cfg)).toBe("plain text body");
  });
});
