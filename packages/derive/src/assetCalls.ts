import type { PairedCall } from "./types.js";

const ASSET_PATH_RE = /\.(?:svg|woff2?|ttf|otf|eot|ico|png|jpe?g|gif|webp|avif)(?:$|[?#])/i;
const DROPPED_CONTENT_PREFIXES = ["image/", "font/", "text/css", "text/javascript"];

// True for static-asset traffic (images, fonts, css, js) that is never an API operation. Shared by
// the portal-api graph view and the deterministic composer so both see the same set of calls.
export function isAssetLikeCall(
  c: Pick<PairedCall, "pathname" | "requestContentType" | "responseContentType">,
): boolean {
  const contentType = (c.responseContentType ?? c.requestContentType ?? "").toLowerCase();
  if (DROPPED_CONTENT_PREFIXES.some((prefix) => contentType.startsWith(prefix))) return true;
  return ASSET_PATH_RE.test(c.pathname);
}
