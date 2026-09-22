import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Only portal-web renders to a DOM, so only it needs jsdom — every other package's vitest run
// stays on the (faster) default node environment.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
});
