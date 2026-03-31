#!/usr/bin/env bash
# Astrix Security - UserPromptSubmit hook
# Scans user prompts for secrets/tokens before Claude processes them
# Exit 0 = allow, Exit 2 = block and erase prompt

set -euo pipefail

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('prompt',''))" 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id','unknown'))" 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_FILE="${ASTRIX_LOG_DIR:-/tmp}/astrix-audit.log"

# --- Secret patterns to detect ---
declare -A SECRET_PATTERNS=(
  ["AWS Access Key"]="AKIA[0-9A-Z]{16}"
  ["AWS Secret Key"]="[0-9a-zA-Z/+]{40}"
  ["GitHub Token"]="ghp_[A-Za-z0-9]{36}"
  ["GitHub Fine-grained"]="github_pat_[A-Za-z0-9_]{82}"
  ["OpenAI Key"]="sk-[A-Za-z0-9]{48}"
  ["Anthropic Key"]="sk-ant-[A-Za-z0-9\-]{95}"
  ["Slack Token"]="xox[baprs]-[0-9A-Za-z\-]+"
  ["Private Key"]="-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----"
  ["Generic Secret"]="(password|secret|token|api_key)\s*[=:]\s*['\"][^'\"]{8,}['\"]"
)

log_event() {
  local action="$1"
  local secret_type="$2"
  echo "{\"timestamp\":\"$TIMESTAMP\",\"session\":\"$SESSION_ID\",\"hook\":\"UserPromptSubmit\",\"action\":\"$action\",\"secret_type\":\"$secret_type\"}" >> "$LOG_FILE"
}

for label in "${!SECRET_PATTERNS[@]}"; do
  pattern="${SECRET_PATTERNS[$label]}"
  if echo "$PROMPT" | grep -qE "$pattern" 2>/dev/null; then
    log_event "BLOCKED" "$label"
    echo "🛡️  Astrix Security: Potential secret detected in prompt ($label)." >&2
    echo "   Prompt has been blocked and erased. Please remove secrets before continuing." >&2
    echo "   Session: $SESSION_ID | Logged: $TIMESTAMP" >&2
    exit 2
  fi
done

log_event "ALLOWED" ""
exit 0
