---
description: View the Astrix Security audit log for this session
---

Show the Astrix Security audit log. Run this bash command and display the results in a readable table format:

```bash
LOG_FILE="${ASTRIX_LOG_DIR:-/tmp}/astrix-audit.log"
if [ -f "$LOG_FILE" ]; then
  echo "=== Astrix Security Audit Log ==="
  cat "$LOG_FILE" | python3 -c "
import sys, json
events = [json.loads(l) for l in sys.stdin if l.strip()]
for e in events[-50:]:  # last 50 events
    action = e.get('action','?')
    hook = e.get('hook','?')
    ts = e.get('timestamp','?')
    reason = e.get('reason','')
    extra = e.get('command') or e.get('file') or e.get('secret_type') or ''
    icon = '🛡️ BLOCKED' if action == 'BLOCKED' else '✅ ALLOWED'
    print(f'{ts}  {icon:15}  {hook:30}  {extra[:40]}  {reason}')
"
else
  echo "No audit log found at \$LOG_FILE"
fi
```
