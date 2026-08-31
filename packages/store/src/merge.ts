import type { CatalogAnnotation, Operation, TestingAnnotation } from "@backbencher/schemas";

// The merge rule: mergedOperation = derived ⊕ catalog annotation ⊕ testing annotation.
// Catalog fields (name/does/area/sideEffect) are ADDITIVE and drive composition; testing fields are
// ADDITIVE and drive test generation; correctionOverrides REPLACE the corresponding derived values.
// This is the single source of truth for "what the agent sees".

export interface MergedOperation extends Operation {
  reviewState: CatalogAnnotation["reviewState"];
  suggested: boolean;
  tags: string[];
  name?: string;
  does?: string;
  productArea?: string;
  sideEffect?: CatalogAnnotation["sideEffect"];
  paramDocs?: Record<string, string>;
  testingGuidance?: string;
}

export function mergeOperation(
  derived: Operation,
  catalog?: CatalogAnnotation | null,
  testing?: TestingAnnotation | null,
): MergedOperation {
  const merged: MergedOperation = {
    ...derived,
    reviewState: catalog?.reviewState ?? "unannotated",
    suggested: catalog?.suggested ?? false,
    tags: testing?.tags ?? [],
  };

  if (catalog) {
    if (catalog.name !== undefined) merged.name = catalog.name;
    if (catalog.does !== undefined) merged.does = catalog.does;
    if (catalog.productArea !== undefined) merged.productArea = catalog.productArea;
    if (catalog.sideEffect !== undefined) merged.sideEffect = catalog.sideEffect;
  }

  if (!testing) return merged;
  if (testing.paramDocs !== undefined) merged.paramDocs = testing.paramDocs;
  if (testing.testingGuidance !== undefined) merged.testingGuidance = testing.testingGuidance;

  const co = testing.correctionOverrides;
  if (co) {
    if (co.pathTemplate !== undefined) {
      merged.pathTemplate = { ...merged.pathTemplate, template: co.pathTemplate };
    }
    if (co.requiredQueryParams !== undefined) {
      const required = new Set(co.requiredQueryParams);
      merged.queryParams = merged.queryParams.map((q) => (required.has(q.name) ? { ...q, required: true } : q));
    }
    if (co.ignoreFields !== undefined) {
      merged.volatileResponseFields = [...new Set([...merged.volatileResponseFields, ...co.ignoreFields])].sort();
    }
  }
  return merged;
}
