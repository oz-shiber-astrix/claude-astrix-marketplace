#!/usr/bin/env bash
# Astrix Security - SessionStart hook
# Logs session start and keeps the persistent policy cache up to date.
#
# Token and server URL are derived from the marketplace git URL stored in
# ~/.claude/plugins/known_marketplaces.json — no env vars required.
# The marketplace name is resolved from CLAUDE_PLUGIN_ROOT.
#
# Policy is only re-fetched when the server version advances or clientId changes;
# the cache (~/.claude/astrix-policy.json) survives reboots.
# Exit 0 always — Claude Code must never be blocked from starting.

set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id','unknown'))" 2>/dev/null || echo "unknown")
TRIGGER=$(echo "$INPUT"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('trigger','unknown'))" 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_FILE="${ASTRIX_LOG_DIR:-/tmp}/astrix-audit.log"
HOSTNAME=$(hostname 2>/dev/null || echo "unknown")
USERNAME=$(whoami    2>/dev/null || echo "unknown")
CWD=$(pwd            2>/dev/null || echo "unknown")
POLICY_CACHE="${HOME}/.claude/astrix-policy.json"
KNOWN_MARKETPLACES="${HOME}/.claude/plugins/known_marketplaces.json"

log_event() {
  local event="$1"
  local extra="${2:-}"
  echo "{\"timestamp\":\"$TIMESTAMP\",\"session\":\"$SESSION_ID\",\"hook\":\"SessionStart\",\"event\":\"$event\"${extra}}" >> "$LOG_FILE"
}

# Log session start
log_event "session_start" ",\"trigger\":\"$TRIGGER\",\"host\":\"$HOSTNAME\",\"user\":\"$USERNAME\",\"cwd\":$(echo "$CWD" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")"

# ── Derive marketplace name from CLAUDE_PLUGIN_ROOT ──────────────────────────
# Path format: .../.claude/plugins/cache/<marketplace-name>/<plugin-name>/<version>
MARKETPLACE_NAME=""
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
  MARKETPLACE_NAME=$(python3 -c "
path = '${CLAUDE_PLUGIN_ROOT}'.rstrip('/')
parts = path.replace('\\\\', '/').split('/')
try:
    idx = parts.index('cache')
    print(parts[idx + 1])
except (ValueError, IndexError):
    print('')
" 2>/dev/null || echo "")
fi

if [[ -z "$MARKETPLACE_NAME" || ! -f "$KNOWN_MARKETPLACES" ]]; then
  exit 0
fi

# ── Resolve token and server URL ─────────────────────────────────────────────
# Priority 1: env vars injected via Claude managed settings (README / GitHub-source approach)
#   ASTRIX_CLIENT_TOKEN=tok_...   ASTRIX_SERVER_URL=https://<ngrok-url>
# Priority 2: credentials embedded in the marketplace git URL (self-hosted approach)
#   https://clientId:TOKEN@server/git/marketplace.git
TOKEN="${ASTRIX_CLIENT_TOKEN:-}"
SERVER_URL="${ASTRIX_SERVER_URL:-}"

if [[ -z "$TOKEN" || -z "$SERVER_URL" ]]; then
  CONFIG_JSON=$(python3 -c "
import json, sys
from urllib.parse import urlparse
try:
    data  = json.load(open('${KNOWN_MARKETPLACES}'))
    entry = data.get('${MARKETPLACE_NAME}', {})
    url   = entry.get('source', {}).get('url', '')
    if not url:
        print('{\"token\":\"\",\"server\":\"\"}')
        sys.exit(0)
    parsed = urlparse(url)
    token  = parsed.password or ''
    port   = f':{parsed.port}' if parsed.port else ''
    server = f'{parsed.scheme}://{parsed.hostname}{port}'
    print(json.dumps({'token': token, 'server': server}))
except Exception:
    print('{\"token\":\"\",\"server\":\"\"}')
" 2>/dev/null || echo '{"token":"","server":""}')

  [[ -z "$TOKEN" ]]      && TOKEN=$(echo "$CONFIG_JSON"      | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"  2>/dev/null || echo "")
  [[ -z "$SERVER_URL" ]] && SERVER_URL=$(echo "$CONFIG_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['server'])" 2>/dev/null || echo "")
fi

if [[ -z "$TOKEN" || -z "$SERVER_URL" ]]; then
  exit 0
fi

# ── Fetch config from server ──────────────────────────────────────────────────
FETCHED=$(curl -sf \
  "${SERVER_URL}/config?token=${TOKEN}" \
  --max-time 3 \
  2>/dev/null || echo "")

if [[ -z "$FETCHED" ]]; then
  # Server unreachable — keep whatever is cached, create empty cache if nothing exists.
  if [[ ! -f "${POLICY_CACHE}" ]]; then
    echo '{"blockedPatterns":[],"version":0}' > "${POLICY_CACHE}"
  fi
  log_event "config_fetch_failed" ",\"server\":\"${SERVER_URL}\""
  exit 0
fi

# ── Version-based cache invalidation ─────────────────────────────────────────
SERVER_VERSION=$(echo "$FETCHED"  | python3 -c "import sys,json; print(json.load(sys.stdin).get('version',1))"   2>/dev/null || echo "1")
SERVER_CLIENT_ID=$(echo "$FETCHED" | python3 -c "import sys,json; print(json.load(sys.stdin).get('clientId',''))" 2>/dev/null || echo "")
CACHED_VERSION=$(python3   -c "import json; print(json.load(open('${POLICY_CACHE}')).get('version',0))"   2>/dev/null || echo "0")
CACHED_CLIENT_ID=$(python3 -c "import json; print(json.load(open('${POLICY_CACHE}')).get('clientId',''))" 2>/dev/null || echo "")

if [[ "$SERVER_VERSION" != "$CACHED_VERSION" || "$SERVER_CLIENT_ID" != "$CACHED_CLIENT_ID" ]]; then
  echo "$FETCHED" > "${POLICY_CACHE}"
  log_event "policy_updated" ",\"previousVersion\":$CACHED_VERSION,\"newVersion\":$SERVER_VERSION,\"clientId\":\"$SERVER_CLIENT_ID\""
else
  log_event "policy_current" ",\"version\":$SERVER_VERSION,\"clientId\":\"$SERVER_CLIENT_ID\""
fi

exit 0
