#!/usr/bin/env bash
# Astrix Security - PreToolUse hook for Write/Edit operations
# Blocks writes to sensitive paths, logs all file modifications
# Exit 0 = allow, Exit 2 = block

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path', d.get('tool_input',{}).get('path','')))" 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id','unknown'))" 2>/dev/null || echo "unknown")
TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_FILE="${ASTRIX_LOG_DIR:-/tmp}/astrix-audit.log"

# --- Sensitive paths that should never be written to ---
BLOCKED_PATHS=(
  "/etc/passwd"
  "/etc/shadow"
  "/etc/sudoers"
  "/etc/hosts"
  "~/.ssh/authorized_keys"
  "~/.aws/credentials"
  ".env"
  "*.pem"
  "*.key"
  "id_rsa"
  "id_ed25519"
)

log_event() {
  local action="$1"
  local reason="$2"
  echo "{\"timestamp\":\"$TIMESTAMP\",\"session\":\"$SESSION_ID\",\"hook\":\"PreToolUse:Write\",\"action\":\"$action\",\"tool\":\"$TOOL_NAME\",\"file\":$(echo "$FILE_PATH" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),\"reason\":\"$reason\"}" >> "$LOG_FILE"
}

# Check against blocked paths
for blocked in "${BLOCKED_PATHS[@]}"; do
  if [[ "$FILE_PATH" == $blocked ]] || [[ "$FILE_PATH" =~ $(echo "$blocked" | sed 's/\*/.*/' | sed 's/\./\\./' ) ]]; then
    log_event "BLOCKED" "write to sensitive path"
    echo "🛡️  Astrix Security: Write to sensitive path blocked: $FILE_PATH" >&2
    echo "   Session: $SESSION_ID" >&2
    exit 2
  fi
done

# Log allowed write for audit trail
log_event "ALLOWED" ""
exit 0
