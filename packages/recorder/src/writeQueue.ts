import { appendFile } from "node:fs/promises";
import { type RecordingEvent, RecordingEventSchema } from "@backbencher/schemas";
import type { Logger } from "@backbencher/shared";

// Serialized NDJSON writer (architecture §3.3, §9): append-on-capture via a single write
// queue, fixing the v1 unbounded-memory gap. Every event is schema-validated at this boundary
// before it touches disk.

function stripQuery(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export class WriteQueue {
  private chain: Promise<void> = Promise.resolve();
  private readonly counts: Record<string, number> = {};
  private readonly endpoints = new Set<string>();
  private warningCount = 0;

  constructor(
    private readonly eventsPath: string,
    private readonly log: Logger,
  ) {}

  push(event: RecordingEvent): void {
    const result = RecordingEventSchema.safeParse(event);
    if (!result.success) {
      this.warningCount += 1;
      this.log.warn(
        { issues: result.error.issues, type: (event as { type?: string }).type },
        "event failed schema validation — dropped",
      );
      return;
    }
    const parsed = result.data;
    this.counts[parsed.type] = (this.counts[parsed.type] ?? 0) + 1;
    if (parsed.type === "api_request") {
      this.endpoints.add(`${parsed.method} ${stripQuery(parsed.url)}`);
    }
    const line = `${JSON.stringify(parsed)}\n`;
    this.chain = this.chain
      .then(() => appendFile(this.eventsPath, line, "utf8"))
      .catch((err: unknown) => {
        this.warningCount += 1;
        this.log.warn({ err }, "NDJSON append failed");
      });
  }

  async drain(): Promise<void> {
    await this.chain;
  }

  get warnings(): number {
    return this.warningCount;
  }

  get eventCounts(): Record<string, number> {
    return { ...this.counts };
  }

  get totalEvents(): number {
    return Object.values(this.counts).reduce((a, b) => a + b, 0);
  }

  get distinctEndpoints(): number {
    return this.endpoints.size;
  }
}
