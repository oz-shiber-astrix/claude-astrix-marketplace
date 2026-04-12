#!/usr/bin/env bash
# Astrix Security - SessionStart hook
# Logs session start and keeps the persistent policy cache up to date.
# Policy is fetched from the Astrix server only when the server version is
# newer than the locally cached version — not on every session start.
# Cache location: ~/.claude/astrix-policy.json
# Exit 0 always — Claude Code must never be blocked from starting.

set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id','unknown'))" 2>/dev/null || echo "unknown")
TRIGGER=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('trigger','unknown'))" 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_FILE="${ASTRIX_LOG_DIR:-/tmp}/astrix-audit.log"
HOSTNAME=$(hostname 2>/dev/null || echo "unknown")
USERNAME=$(whoami 2>/dev/null || echo "unknown")
CWD=$(pwd 2>/dev/null || echo "unknown")
POLICY_CACHE="${HOME}/.claude/astrix-policy.json"

log_event() {
  local event="$1"
  local extra="${2:-}"
  echo "{\"timestamp\":\"$TIMESTAMP\",\"session\":\"$SESSION_ID\",\"hook\":\"SessionStart\",\"event\":\"$event\"${extra}}" >> "$LOG_FILE"
}

# Log session start
log_event "session_start" ",\"trigger\":\"$TRIGGER\",\"host\":\"$HOSTNAME\",\"user\":\"$USERNAME\",\"cwd\":$(echo "$CWD" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")"

# If no token/server configured, nothing to do — existing cache (if any) stays valid.
if [[ -z "${ASTRIX_CLIENT_TOKEN:-}" || -z "${ASTRIX_SERVER_URL:-}" ]]; then
  exit 0
fi

# Fetch config from server (small payload — just a version check + patterns).
FETCHED=$(curl -sf \
  -H "Authorization: Bearer ${ASTRIX_CLIENT_TOKEN}" \
  "${ASTRIX_SERVER_URL}/config" \
  --max-time 3 \
  2>/dev/null || echo "")

if [[ -z "$FETCHED" ]]; then
  # Server unreachable — keep whatever is cached, create empty cache if nothing exists.
  if [[ ! -f "${POLICY_CACHE}" ]]; then
    echo '{"blockedPatterns":[],"version":0}' > "${POLICY_CACHE}"
  fi
  log_event "config_fetch_failed" ",\"server\":\"${ASTRIX_SERVER_URL}\""
  exit 0
fi

# Compare server version to cached version.
SERVER_VERSION=$(echo "$FETCHED" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version',1))" 2>/dev/null || echo "1")
SERVER_CLIENT_ID=$(echo "$FETCHED" | python3 -c "import sys,json; print(json.load(sys.stdin).get('clientId',''))" 2>/dev/null || echo "")
CACHED_VERSION=$(python3 -c "import json; print(json.load(open('${POLICY_CACHE}')).get('version',0))" 2>/dev/null || echo "0")
CACHED_CLIENT_ID=$(python3 -c "import json; print(json.load(open('${POLICY_CACHE}')).get('clientId',''))" 2>/dev/null || echo "")

if [[ "$SERVER_VERSION" != "$CACHED_VERSION" || "$SERVER_CLIENT_ID" != "$CACHED_CLIENT_ID" ]]; then
  echo "$FETCHED" > "${POLICY_CACHE}"
  log_event "policy_updated" ",\"previousVersion\":$CACHED_VERSION,\"newVersion\":$SERVER_VERSION,\"clientId\":\"$SERVER_CLIENT_ID\""
else
  log_event "policy_current" ",\"version\":$SERVER_VERSION,\"clientId\":\"$SERVER_CLIENT_ID\""
fi

exit 0
