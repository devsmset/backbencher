import { randomUUID } from "node:crypto";
import { type Server, createServer } from "node:http";

// Local API fixture (architecture Phase 6 acceptance): create → get → delete resource endpoints
// to exercise an extraction chain + cleanup. No external deps. Exported for cross-package e2e.

interface Thing {
  id: string;
  name: string;
  createdAt: number;
}

export interface ApiFixture {
  url: string;
  close(): Promise<void>;
  count(): number;
}

export async function startApiFixture(): Promise<ApiFixture> {
  const things = new Map<string, Thing>();
  const server: Server = createServer((req, res) => {
    const url = req.url ?? "";
    const send = (code: number, obj?: unknown): void => {
      res.statusCode = code;
      if (obj === undefined) {
        res.end();
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(obj));
    };

    if (req.method === "POST" && url === "/things") {
      let b = "";
      req.on("data", (c) => {
        b += c;
      });
      req.on("end", () => {
        let name = "thing";
        try {
          name = (JSON.parse(b) as { name?: string }).name ?? "thing";
        } catch {
          /* default */
        }
        const thing: Thing = { id: randomUUID(), name, createdAt: Date.now() };
        things.set(thing.id, thing);
        send(201, thing);
      });
      return;
    }

    const m = /^\/things\/([^/?]+)/.exec(url);
    if (m) {
      const id = m[1] as string;
      if (req.method === "GET") {
        const t = things.get(id);
        return t ? send(200, t) : send(404, { error: "not found" });
      }
      if (req.method === "DELETE") {
        return things.delete(id) ? send(204) : send(404, { error: "not found" });
      }
    }

    if (req.method === "GET" && url === "/things") return send(200, [...things.values()]);
    send(404, { error: "not found" });
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
    count: () => things.size,
  };
}
