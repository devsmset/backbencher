#!/usr/bin/env bash
# Build every package and start the portal (API + web UI) so the whole app can be
# driven entirely from the browser — no further CLI commands needed.
#
# Usage:
#   ./scripts/serve.sh [port]
#   ./scripts/serve.sh --port <port>
#   ./scripts/serve.sh --watch-web [port]
#
# Defaults to port 4100. Frees the port first (via scripts/kill-port.sh) in case a
# previous server instance is still holding it. `--watch-web` keeps rebuilding
# portal-web on frontend edits so a browser refresh picks up the latest dist files
# without restarting the server.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

port="4100"
watch_web="0"
server_pid=""
watcher_pid=""

usage() {
	cat <<'EOF'
Usage:
	./scripts/serve.sh [port]
	./scripts/serve.sh --port <port>
	./scripts/serve.sh --watch-web [port]
EOF
}

cleanup() {
	local status=$?
	if [[ -n "$server_pid" ]]; then
		kill "$server_pid" 2>/dev/null || true
		wait "$server_pid" 2>/dev/null || true
	fi
	if [[ -n "$watcher_pid" ]]; then
		kill "$watcher_pid" 2>/dev/null || true
		wait "$watcher_pid" 2>/dev/null || true
	fi
	exit "$status"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--watch-web)
			watch_web="1"
			shift
			;;
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

if [[ "$watch_web" == "1" ]]; then
	echo "==> Watching portal-web for frontend changes"
	pnpm --filter @backbencher/portal-web exec vite build --watch &
	watcher_pid="$!"
fi

echo "==> Starting portal on http://localhost:$port"
cd apps/cli
node dist/index.js serve --port "$port" &
server_pid="$!"

wait "$server_pid"
