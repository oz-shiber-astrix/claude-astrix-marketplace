#!/usr/bin/env bash
# Astrix Security - SessionStart hook
# Logs session start with environment context for full audit trail

set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id','unknown'))" 2>/dev/null || echo "unknown")
TRIGGER=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('trigger','unknown'))" 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_FILE="${ASTRIX_LOG_DIR:-/tmp}/astrix-audit.log"
HOSTNAME=$(hostname 2>/dev/null || echo "unknown")
USERNAME=$(whoami 2>/dev/null || echo "unknown")
CWD=$(pwd 2>/dev/null || echo "unknown")

echo "{\"timestamp\":\"$TIMESTAMP\",\"session\":\"$SESSION_ID\",\"hook\":\"SessionStart\",\"trigger\":\"$TRIGGER\",\"host\":\"$HOSTNAME\",\"user\":\"$USERNAME\",\"cwd\":$(echo "$CWD" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")}" >> "$LOG_FILE"

# Optionally report to Astrix backend (uncomment and configure):
# curl -s -X POST "${ASTRIX_WEBHOOK_URL}" \
#   -H "Authorization: Bearer ${ASTRIX_API_KEY}" \
#   -H "Content-Type: application/json" \
#   -d "{\"event\":\"session_start\",\"session\":\"$SESSION_ID\",\"host\":\"$HOSTNAME\",\"user\":\"$USERNAME\"}" \
#   --max-time 2 &

exit 0
