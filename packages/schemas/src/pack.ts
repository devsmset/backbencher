import { z } from "zod";
import { DataflowEdgeSchema } from "./apimodel.js";
import { ReviewState } from "./knowledge.js";

// Knowledge pack (architecture §2.4) — the agent's food. Versioned + content-hashed so
// agent runs are reproducible.

export const KnowledgePackSchema = z.object({
  version: z.literal(1),
  builtAt: z.number().int(),
  contentHash: z.string(),
  catalog: z.array(
    z.object({
      // ONE COMPACT LINE PER OPERATION — always in agent context
      operationId: z.string(),
      method: z.string(),
      template: z.string(),
      name: z.string().optional(),
      area: z.string().optional(),
      auth: z.string(),
      statuses: z.array(z.number()),
      reviewState: ReviewState,
    }),
  ),
  operations: z.record(z.unknown()), // operationId -> full merged detail doc, retrieved on demand
  flows: z.array(z.unknown()), // approved Scenario objects
  guides: z.array(z.unknown()), // AnalystGuide objects
  dataflow: z.array(DataflowEdgeSchema),
  authProfiles: z.array(z.object({ name: z.string(), description: z.string() })), // NO SECRETS
  environments: z.array(
    z.object({ name: z.string(), baseUrl: z.string(), destructive: z.boolean() }),
  ),
});
export type KnowledgePack = z.infer<typeof KnowledgePackSchema>;
