import type { AppRouter } from "@backbencher/portal-api";
import { createTRPCReact } from "@trpc/react-query";

// End-to-end typed client: the portal-api AppRouter type flows into every hook (§6.3, §0).
export const trpc = createTRPCReact<AppRouter>();
