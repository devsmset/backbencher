export { buildKnowledgePack, packDiff } from "./pack.js";
export type { BuildPackOptions, BuildPackResult, PackDiff } from "./pack.js";
export { assembleContext, validateSpec, generateTestSpec, createLlm } from "./generate.js";
export type { LlmComplete, GenerateOptions, GenerateResult } from "./generate.js";
export { computeDependencyGraph } from "./dependencies.js";
export {
  localEmbed,
  localEmbedder,
  createEmbedder,
  cosineSimilarity,
  topK,
  endpointRetrievalText,
  retrievalCorpus,
  retrieveForGoal,
  warmEmbeddings,
} from "./embed.js";
export type { Embed, Embedder, RetrievableItem, RetrievalResult, RetrieveOptions } from "./embed.js";
export { proposeScenario } from "./compose.js";
export type { ComposeOptions, ComposeResult } from "./compose.js";
export { suggestAnnotations } from "./suggest.js";
export type { SuggestOptions, SuggestResult } from "./suggest.js";
export { runRehearsal, summarize, latestResults } from "./rehearsal.js";
export type { RehearsalRunOptions, RehearsalSummary } from "./rehearsal.js";
export { proposeCompositionFromSession, UnclassifiedCallsError, UnansweredCallsError, NoReplayableCallsError } from "./composeFromSession.js";
export { generateTestSpecFromSession } from "./generateFromSession.js";
export type { GenerateFromSessionResult } from "./generateFromSession.js";
