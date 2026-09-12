import {
  AnalystGuideSchema,
  CatalogAnnotationSchema,
  CompositionSchema,
  RehearsalGoalSchema,
  RehearsalResultSchema,
  TestingAnnotationSchema,
} from "./knowledge.js";
import {
  CatalogDependencyEdgeSchema,
  DataflowEdgeSchema,
  ObservedFlowSchema,
  OperationDependencySchema,
  OperationSchema,
  PathTemplateSchema,
  SessionGraphSchema,
} from "./apimodel.js";
import { KnowledgePackSchema } from "./pack.js";
import {
  RecordingEventSchema,
  RecordingMetaSchema,
  RecordingSummarySchema,
} from "./recording.js";
import { TestSpecSchema } from "./testspec.js";

export * from "./recording.js";
export * from "./apimodel.js";
export * from "./knowledge.js";
export * from "./pack.js";
export * from "./testspec.js";

export const SCHEMAS_VERSION = "1.0.0";

/**
 * Registry of top-level contracts for JSON Schema generation (`gen:jsonschema`) and
 * boundary validation. Keep in sync with architecture §2.
 */
export const schemaRegistry = {
  RecordingMeta: RecordingMetaSchema,
  RecordingEvent: RecordingEventSchema,
  RecordingSummary: RecordingSummarySchema,
  PathTemplate: PathTemplateSchema,
  Operation: OperationSchema,
  DataflowEdge: DataflowEdgeSchema,
  SessionGraph: SessionGraphSchema,
  ObservedFlow: ObservedFlowSchema,
  CatalogDependencyEdge: CatalogDependencyEdgeSchema,
  OperationDependency: OperationDependencySchema,
  CatalogAnnotation: CatalogAnnotationSchema,
  TestingAnnotation: TestingAnnotationSchema,
  AnalystGuide: AnalystGuideSchema,
  Composition: CompositionSchema,
  RehearsalGoal: RehearsalGoalSchema,
  RehearsalResult: RehearsalResultSchema,
  KnowledgePack: KnowledgePackSchema,
  TestSpec: TestSpecSchema,
} as const;
