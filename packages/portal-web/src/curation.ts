/**
 * The redundant-Call count is not persisted: it is whatever the derivation dropped that the analyst
 * did not delete by hand (design §5, `sessions.curation`).
 */
export function curationCounts(curation: {
  rawCallCount: number;
  curatedCallCount: number;
  deletedCorrelationIds: readonly string[];
}): { redundant: number; deleted: number } {
  const deleted = curation.deletedCorrelationIds.length;
  // Clamped: a Session with deletions recorded but no curated file yet would otherwise go negative.
  const redundant = Math.max(0, curation.rawCallCount - curation.curatedCallCount - deleted);
  return { redundant, deleted };
}

export function curationSummary(curation: {
  rawCallCount: number;
  curatedCallCount: number;
  deletedCorrelationIds: readonly string[];
}): string {
  const { redundant, deleted } = curationCounts(curation);
  return `${redundant} redundant calls filtered, ${deleted} deleted by you`;
}
