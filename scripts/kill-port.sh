#!/usr/bin/env bash
# Kill whatever process is listening on a given TCP port.
# Works in git-bash on Windows (uses netstat + taskkill) and falls back to
# lsof/kill on macOS/Linux.
#
# Usage:
#   ./scripts/kill-port.sh <port>

set -euo pipefail

port="${1:-}"

if [[ -z "$port" ]]; then
  echo "Usage: $0 <port>" >&2
  exit 1
fi

if ! [[ "$port" =~ ^[0-9]+$ ]]; then
  echo "Error: '$port' is not a valid port number" >&2
  exit 1
fi

if command -v netstat >/dev/null 2>&1 && (command -v taskkill >/dev/null 2>&1 || uname -s | grep -qi mingw); then
  # Windows / git-bash path.
  pids=$(netstat -ano -p tcp 2>/dev/null | grep -E "[:.]${port}[[:space:]]+.*LISTENING" | awk '{print $NF}' | sort -u)

  if [[ -z "$pids" ]]; then
    echo "No process found listening on port $port"
    exit 0
  fi

  for pid in $pids; do
    if [[ "$pid" == "0" ]]; then
      continue
    fi
    echo "Killing PID $pid (port $port)"
    taskkill //PID "$pid" //F || taskkill /PID "$pid" /F || true
  done
else
  # macOS / Linux path.
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)

  if [[ -z "$pids" ]]; then
    echo "No process found listening on port $port"
    exit 0
  fi

  for pid in $pids; do
    echo "Killing PID $pid (port $port)"
    kill -9 "$pid"
  done
fi

echo "Done."
