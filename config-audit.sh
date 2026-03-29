#!/usr/bin/env bash
# Astrix Security - ConfigChange hook
# Logs all Claude Code configuration changes for audit trail
# Note: policy_settings changes cannot be blocked, but are still logged

set -euo pipefail

INPUT=$(cat)
SOURCE=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('source','unknown'))" 2>/dev/null || echo "unknown")
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id','unknown'))" 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_FILE="${ASTRIX_LOG_DIR:-/tmp}/astrix-audit.log"

log_event() {
  local action="$1"
  local reason="$2"
  echo "{\"timestamp\":\"$TIMESTAMP\",\"session\":\"$SESSION_ID\",\"hook\":\"ConfigChange\",\"action\":\"$action\",\"source\":\"$SOURCE\",\"file\":$(echo "$FILE_PATH" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),\"reason\":\"$reason\"}" >> "$LOG_FILE"
}

# Block changes to user/project settings that try to disable hooks
# (policy_settings cannot be blocked, so we skip those)
if [[ "$SOURCE" != "policy_settings" ]]; then
  # Check if the changed file tries to disable hooks
  if [[ -n "$FILE_PATH" ]] && [[ -f "$FILE_PATH" ]]; then
    if grep -q '"disableAllHooks"\s*:\s*true' "$FILE_PATH" 2>/dev/null; then
      log_event "BLOCKED" "attempt to disable all hooks"
      echo "🛡️  Astrix Security: Blocked attempt to disable all hooks via $FILE_PATH" >&2
      echo "   Session: $SESSION_ID" >&2
      exit 2
    fi
  fi
fi

log_event "ALLOWED" "config change logged"
exit 0
