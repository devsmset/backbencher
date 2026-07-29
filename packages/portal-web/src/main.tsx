import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { trpc } from "./trpc.js";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/trpc",
      headers() {
        const analyst = localStorage.getItem("bb.analyst") ?? "analyst";
        const token = localStorage.getItem("bb.token") ?? "";
        return { "x-analyst": analyst, ...(token ? { "x-portal-token": token } : {}) };
      },
    }),
  ],
});

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </trpc.Provider>
    </StrictMode>,
  );
}
