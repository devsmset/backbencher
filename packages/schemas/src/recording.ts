import { z } from "zod";

// Session recording v3 (realignment guide §3) — pure, timestamped API request/response
// sequences. No UI events, no locators, no popups: a session is a scenario made of API calls.

export const RecordingMetaSchema = z.object({
  version: z.literal(3),
  sessionId: z.string(), // ulid()
  sessionName: z.string().optional(), // analyst names the session = the scenario it represents
  goal: z.string().optional(), // free-text intent, e.g. "login and land on homepage"
  startUrl: z.string().url(),
  startedAt: z.number().int(), // epoch ms
  endedAt: z.number().int().optional(),
  userAgent: z.string(),
  operator: z.string().optional(), // analyst identifier
  authProfile: z.string().optional(), // e.g. "admin", "viewer" — CRITICAL for authz matrix
  appVersion: z.string().optional(),
  recorderVersion: z.string(),
});
export type RecordingMeta = z.infer<typeof RecordingMetaSchema>;

export const ApiRequestEventSchema = z.object({
  type: z.literal("api_request"),
  correlationId: z.string(), // ulid, minted per request — THE pairing key
  timestamp: z.number().int(),
  method: z.string(),
  url: z.string(),
  resourceType: z.enum(["xhr", "fetch", "document", "other"]),
  headers: z.record(z.string()), // post-redaction
  headersSource: z.enum(["sync", "all"]), // §3.1 bug 4: which header set was captured
  postData: z.string().nullable(), // post-redaction, capped
  postDataTruncated: z.boolean(),
});
export type ApiRequestEvent = z.infer<typeof ApiRequestEventSchema>;

export const ApiResponseEventSchema = z.object({
  type: z.literal("api_response"),
  correlationId: z.string(), // matches its request
  timestamp: z.number().int(),
  status: z.number().int(), // 0 = requestfailed, -1 = flushed-pending-at-save (§3.3)
  headers: z.record(z.string()),
  headersSource: z.enum(["sync", "all"]).optional(), // §3.1 bug 4: which header set was captured
  bodyKind: z.enum(["json", "text", "binary", "empty", "unavailable"]),
  body: z.unknown().nullable(), // parsed JSON if json, capped string if text, null otherwise
  bodyBytes: z.number().int().optional(),
  bodyTruncated: z.boolean(),
  timing: z
    .object({ requestStart: z.number(), responseEnd: z.number() })
    .partial()
    .optional(),
});
export type ApiResponseEvent = z.infer<typeof ApiResponseEventSchema>;

export const RecordingEventSchema = z.discriminatedUnion("type", [
  ApiRequestEventSchema,
  ApiResponseEventSchema,
]);
export type RecordingEvent = z.infer<typeof RecordingEventSchema>;

// Written to summary.json when a session completes (§2.1).
export const RecordingSummarySchema = z.object({
  sessionId: z.string(),
  startedAt: z.number().int(),
  endedAt: z.number().int(),
  durationMs: z.number().int().nonnegative(),
  totalEvents: z.number().int().nonnegative(),
  eventCounts: z.record(z.number().int()),
  distinctEndpoints: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(), // recorder_warning counter (§3.1 bug 8)
});
export type RecordingSummary = z.infer<typeof RecordingSummarySchema>;
