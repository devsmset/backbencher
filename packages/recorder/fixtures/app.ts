import { type Server, createServer } from "node:http";

// Minimal httpbin-style fixture app for recorder CI e2e (architecture Phase 2 acceptance).
// Serves a login form (with a password field) + JSON API endpoints. No external deps.

const HTML = `<!doctype html>
<html>
  <body>
    <form id="login">
      <input id="username" name="username" autocomplete="username" />
      <input id="password" name="password" type="password" autocomplete="current-password" />
      <button id="submit" type="button">Login</button>
    </form>
    <div id="result"></div>
    <script>
      document.getElementById('submit').addEventListener('click', async () => {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const r = await fetch('/api/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const j = await r.json();
        await fetch('/api/logo.svg');
        await fetch('/api/page');
        document.getElementById('result').textContent = j.ok ? 'ok' : 'fail';
      });
    </script>
  </body>
</html>`;

export interface Fixture {
  url: string;
  close(): Promise<void>;
}

export async function startFixture(): Promise<Fixture> {
  const server: Server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/" || url === "") {
      res.setHeader("content-type", "text/html");
      res.end(HTML);
      return;
    }
    if (url === "/api/login" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, token: "server-issued-token", id: "u1" }));
      });
      return;
    }
    if (url.startsWith("/api/profile")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "u1", name: "Suite Admin" }));
      return;
    }
    if (url === "/api/logo.svg") {
      res.setHeader("content-type", "image/svg+xml");
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
      return;
    }
    if (url === "/api/page") {
      res.setHeader("content-type", "text/html");
      res.end("<!doctype html><html><body>a page, not an api</body></html>");
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
