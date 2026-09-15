#!/usr/bin/env bash
# Build every package and start the portal (API + web UI) so the whole app can be
# driven entirely from the browser — no further CLI commands needed.
#
# Usage:
#   ./scripts/serve.sh [port]
#   ./scripts/serve.sh --port <port>
#
# Defaults to port 4100 for the API. Frees the port first (via scripts/kill-port.sh)
# in case a previous server instance is still holding it. Always starts portal-web's
# Vite dev server too (real hot module reload, no manual refresh) — open the printed
# UI URL, not the API port, to get hot reload.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

port="4100"
server_pid=""
vite_pid=""

usage() {
	cat <<'EOF'
Usage:
	./scripts/serve.sh [port]
	./scripts/serve.sh --port <port>
EOF
}

cleanup() {
	local status=$?
	if [[ -n "$server_pid" ]]; then
		kill "$server_pid" 2>/dev/null || true
		wait "$server_pid" 2>/dev/null || true
	fi
	if [[ -n "$vite_pid" ]]; then
		kill "$vite_pid" 2>/dev/null || true
		wait "$vite_pid" 2>/dev/null || true
	fi
	exit "$status"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--port)
			if [[ $# -lt 2 ]]; then
				usage
				exit 1
			fi
			port="$2"
			shift 2
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			if [[ "$port" == "4100" ]]; then
				port="$1"
				shift
			else
				echo "Unknown argument: $1" >&2
				usage
				exit 1
			fi
			;;
	esac
done

trap cleanup EXIT INT TERM

echo "==> Building all packages (pnpm -r build)"
pnpm -r build

echo "==> Freeing port $port (if in use)"
"$repo_root/scripts/kill-port.sh" "$port" || true

echo "==> Starting portal API on http://localhost:$port"
cd apps/cli
node dist/index.js serve --port "$port" &
server_pid="$!"
cd "$repo_root"

echo "==> Starting portal-web dev server (hot reload) on http://localhost:5173"
BB_API_PORT="$port" pnpm --filter @backbencher/portal-web exec vite &
vite_pid="$!"

echo ""
echo "Open http://localhost:5173 for the hot-reloading UI (proxies /trpc to :$port)."
echo ""

wait "$server_pid"
