import type { BbConfig } from "@backbencher/shared";
import type { Store } from "@backbencher/store";
import { initTRPC } from "@trpc/server";

// tRPC base (architecture §6.2). Context carries the store, the acting analyst (from a header),
// and config. Auth is enforced by a Fastify onRequest hook in server.ts.

export interface Context {
  store: Store;
  actor: string;
  config: BbConfig;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
