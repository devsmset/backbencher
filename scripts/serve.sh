#!/usr/bin/env bash
# Build every package and start the portal (API + web UI) so the whole app can be
# driven entirely from the browser — no further CLI commands needed.
#
# Usage:
#   ./scripts/serve.sh [port]
#
# Defaults to port 4100. Frees the port first (via scripts/kill-port.sh) in case a
# previous server instance is still holding it.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

port="${1:-4100}"

echo "==> Building all packages (pnpm -r build)"
pnpm -r build

echo "==> Freeing port $port (if in use)"
"$repo_root/scripts/kill-port.sh" "$port" || true

echo "==> Starting portal on http://localhost:$port"
cd apps/cli
exec node dist/index.js serve --port "$port"
