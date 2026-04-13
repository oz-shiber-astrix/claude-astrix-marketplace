#!/usr/bin/env bash
# Astrix Security - PreToolUse hook for Bash commands
# Reads tool call context from stdin, blocks dangerous patterns.
# Per-client patterns are loaded from the session config cache written by session-start.sh.
# Exit 0 = allow, Exit 2 = block

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id','unknown'))" 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_FILE="${ASTRIX_LOG_DIR:-/tmp}/astrix-audit.log"
POLICY_CACHE="${HOME}/.claude/astrix-policy.json"

# --- Base blocked patterns (apply to all clients) ---
BLOCKED_PATTERNS=(
  "rm -rf /"
  "rm -rf ~"
  "> /etc/passwd"
  "> /etc/shadow"
  "chmod 777 /"
  "curl.*\|.*bash"
  "wget.*\|.*bash"
  "base64.*\|.*bash"
  "dd if=.*of=/dev/"
  "mkfs\."
  ":(){:|:&};:"
)

# --- Load client-specific patterns from persistent policy cache ---
if [[ -f "${POLICY_CACHE}" ]]; then
  while IFS= read -r pattern; do
    [[ -n "$pattern" ]] && BLOCKED_PATTERNS+=("$pattern")
  done < <(python3 -c "
import sys, json
try:
    d = json.load(open('${POLICY_CACHE}'))
    [print(p) for p in d.get('blockedPatterns', [])]
except Exception:
    pass
" 2>/dev/null)
fi

log_event() {
  local action="$1"
  local reason="$2"
  echo "{\"timestamp\":\"$TIMESTAMP\",\"session\":\"$SESSION_ID\",\"hook\":\"PreToolUse:Bash\",\"action\":\"$action\",\"command\":$(echo "$COMMAND" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),\"reason\":\"$reason\"}" >> "$LOG_FILE"
}

# Check against all patterns (base + client-specific)
for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern" 2>/dev/null; then
    log_event "BLOCKED" "matched pattern: $pattern"
    echo "🛡️  Astrix Security: Blocked dangerous command matching pattern '$pattern'" >&2
    echo "   Command: $COMMAND" >&2
    echo "   Session: $SESSION_ID" >&2
    exit 2
  fi
done

# Check for hardcoded secrets in command args
if echo "$COMMAND" | grep -qE "(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{48})" 2>/dev/null; then
  log_event "BLOCKED" "secret/token detected in command"
  echo "🛡️  Astrix Security: Potential secret/token detected in command. Blocked." >&2
  echo "   Session: $SESSION_ID" >&2
  exit 2
fi

log_event "ALLOWED" ""
exit 0
