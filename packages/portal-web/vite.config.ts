import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Portal web build (architecture §6.3). In dev, /trpc is proxied to portal-api on :4000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/trpc": "http://localhost:4000" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
