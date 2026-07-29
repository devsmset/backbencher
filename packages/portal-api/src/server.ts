import { existsSync } from "node:fs";
import { type BbConfig, childLogger, loadConfig } from "@backbencher/shared";
import { type Store, openStore } from "@backbencher/store";
import fastifyStatic from "@fastify/static";
import { type CreateFastifyContextOptions, fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { type AppRouter, appRouter } from "./routers.js";
import type { Context } from "./trpc.js";

// Fastify host (architecture §6.2): serves the built portal-web statically + tRPC at /trpc,
// with a single shared-token auth hook.

const log = childLogger({ mod: "portal-api" });

export interface BuildServerOptions {
  store?: Store;
  config?: BbConfig;
  portalToken?: string;
  staticDir?: string;
}

export interface BuiltServer {
  app: FastifyInstance;
  store: Store;
}

function bearer(header?: string): string | undefined {
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

export function buildServer(opts: BuildServerOptions = {}): BuiltServer {
  const store = opts.store ?? openStore();
  const config = opts.config ?? loadConfig();
  const portalToken = opts.portalToken ?? process.env.PORTAL_TOKEN;
  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (req, reply) => {
    if (!portalToken || req.url === "/health") return;
    const provided = (req.headers["x-portal-token"] as string | undefined) ?? bearer(req.headers.authorization);
    if (provided !== portalToken) {
      await reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/health", async () => ({ ok: true }));

  void app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: ({ req }: CreateFastifyContextOptions): Context => ({
        store,
        actor: (req.headers["x-analyst"] as string | undefined) ?? "anonymous",
        config,
      }),
    },
  });

  if (opts.staticDir && existsSync(opts.staticDir)) {
    void app.register(fastifyStatic, { root: opts.staticDir, prefix: "/" });
  }

  return { app, store };
}

export async function startServer(port = 4000, opts: BuildServerOptions = {}): Promise<BuiltServer> {
  const built = buildServer(opts);
  await built.app.listen({ port, host: "0.0.0.0" });
  log.info({ port }, "portal-api listening");
  return built;
}

export type { AppRouter };
