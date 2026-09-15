import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Portal web build (architecture §6.3). In dev, /trpc is proxied to portal-api, whose port
// scripts/serve.sh passes through via BB_API_PORT (default 4000, matching `bb serve`'s default).
const apiPort = process.env.BB_API_PORT ?? "4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/trpc": `http://localhost:${apiPort}` },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
