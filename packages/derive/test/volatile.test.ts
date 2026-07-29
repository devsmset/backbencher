import { describe, expect, it } from "vitest";
import { volatileFixture } from "../fixtures/sessions.js";
import { runDerivation } from "../src/pipeline.js";

describe("detectVolatileFields", () => {
  it("masks a field that changes across identical requests, keeping stable fields", () => {
    const result = runDerivation([volatileFixture()]);
    const profile = result.operations.find((o) => o.pathTemplate.template === "/api/profile");
    expect(profile).toBeDefined();
    expect(profile?.volatileResponseFields).toContain("$.updatedAt");
    expect(profile?.volatileResponseFields).not.toContain("$.id");
  });
});
