import type { Operation, OperationAnnotation } from "@backbencher/schemas";

// The merge rule (architecture §6.4): mergedOperation = derived ⊕ annotation.
// Human name/does/paramDocs/testingGuidance are ADDITIVE; correctionOverrides
// REPLACE the corresponding derived values. This is the single source of truth for "what the
// agent sees" and is used by both the portal and the pack builder.

export interface MergedOperation extends Operation {
  reviewState: OperationAnnotation["reviewState"];
  tags: string[];
  name?: string;
  does?: string;
  productArea?: string;
  sideEffect?: OperationAnnotation["sideEffect"];
  paramDocs?: Record<string, string>;
  testingGuidance?: string;
}

export function mergeOperation(
  derived: Operation,
  annotation?: OperationAnnotation | null,
): MergedOperation {
  const merged: MergedOperation = {
    ...derived,
    reviewState: annotation?.reviewState ?? "unreviewed",
    tags: annotation?.tags ?? [],
  };
  if (!annotation) return merged;

  if (annotation.name !== undefined) merged.name = annotation.name;
  if (annotation.does !== undefined) merged.does = annotation.does;
  if (annotation.productArea !== undefined) merged.productArea = annotation.productArea;
  if (annotation.sideEffect !== undefined) merged.sideEffect = annotation.sideEffect;
  if (annotation.paramDocs !== undefined) merged.paramDocs = annotation.paramDocs;
  if (annotation.testingGuidance !== undefined) merged.testingGuidance = annotation.testingGuidance;

  const co = annotation.correctionOverrides;
  if (co) {
    if (co.pathTemplate !== undefined) {
      merged.pathTemplate = { ...merged.pathTemplate, template: co.pathTemplate };
    }
    if (co.requiredQueryParams !== undefined) {
      const required = new Set(co.requiredQueryParams);
      merged.queryParams = merged.queryParams.map((q) =>
        required.has(q.name) ? { ...q, required: true } : q,
      );
    }
    if (co.ignoreFields !== undefined) {
      merged.volatileResponseFields = [
        ...new Set([...merged.volatileResponseFields, ...co.ignoreFields]),
      ].sort();
    }
  }
  return merged;
}
