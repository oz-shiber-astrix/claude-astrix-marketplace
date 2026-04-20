# Astrix Security — Claude Code Marketplace

Self-hosted Claude Code plugin marketplace with per-org security policy distribution. One plugin for all organizations — policy is delivered at runtime via a token each org places in their Claude managed settings.

---

## How It Works

```
Astrix Admin
  POST /admin/clients → token issued, version=1
        ↓
  Hands token to org's Claude admin
        ↓
Org Claude Admin
  Pastes env vars into Claude.ai Admin Console (once)
        ↓
Anthropic distributes env vars to all developers automatically
        ↓
Developer opens Claude Code
  SessionStart hook: fetches policy from server, caches to ~/.claude/astrix-policy.json
        ↓
Developer asks Claude to run a command or submits a prompt
  PreToolUse hook: checks command against base + org patterns → ALLOW or BLOCK
  UserPromptSubmit hook: checks prompt against secrets + org patterns → ALLOW or BLOCK
        ↓
Admin updates org policy via API
  version increments → all developers pick it up on next Claude Code restart
```

---

## Repository Structure

```
claude-astrix-marketplace/
├── .claude-plugin/
│   └── marketplace.json              # Marketplace catalog (Claude Code reads this)
├── plugins/
│   └── astrix-security-hooks/
│       ├── .claude-plugin/
│       │   └── plugin.json           # Plugin manifest
│       ├── hooks/
│       │   ├── hooks.json            # Hook event wiring
│       │   ├── session-start.sh      # Fetches + caches org policy on session open
│       │   ├── pre-tool-bash.sh      # Intercepts every Bash command; blocks matches
│       │   ├── prompt-scan.sh        # Scans prompts for secrets + org patterns
│       │   ├── pre-tool-write.sh     # File write auditor
│       │   └── config-audit.sh       # Config change auditor
│       ├── skills/astrix-scan/
│       │   └── SKILL.md              # Ambient security guidance for Claude
│       └── commands/
│           └── audit-log.md          # /astrix-security-hooks:audit-log command
└── server/
    ├── index.js                      # Entry point — starts Express + ngrok tunnel
    ├── .env.example                  # Copy to .env and fill in secrets
    ├── src/
    │   ├── app.js                    # Route wiring
    │   ├── middleware/auth.js        # Admin token + client token auth
    │   └── routes/
    │       ├── admin.js              # CRUD API for managing client orgs
    │       ├── config.js             # GET /config — client policy endpoint
    │       └── status.js             # Dashboard UI at /
    └── data/
        └── clients.json              # Client records (gitignored — contains tokens)
```

---

## Server Setup

**Prerequisites:** Node.js 18+, an [ngrok](https://ngrok.com) account for public URL.

```bash
cd server
cp .env.example .env
# Edit .env — set ADMIN_TOKEN and NGROK_AUTHTOKEN
npm install
npm start
```

The server prints its public ngrok URL on startup.

---

## Admin API

All admin endpoints require `Authorization: Bearer $ADMIN_TOKEN`.

```bash
# Create a client org
curl -X POST https://<server>/admin/clients \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"acme-corp","companyName":"Acme Corporation","extraBlockedPatterns":["acme_internal_.*"]}'

# Update blocked patterns (increments version → all devs pick it up on next restart)
curl -X PUT https://<server>/admin/clients/acme-corp \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"extraBlockedPatterns":["acme_internal_.*","DROP TABLE"]}'

# List all clients
curl https://<server>/admin/clients \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Rotate a client token
curl -X POST https://<server>/admin/clients/acme-corp/rotate-token \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Delete a client
curl -X DELETE https://<server>/admin/clients/acme-corp \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

The status dashboard at `https://<server>/` shows all clients, masked tokens, and the managed settings snippet to hand to each org's Claude admin.

---

## Org Onboarding (No MDM Required)

After creating a client, hand the org's Claude admin this snippet. They paste it into **Claude.ai Admin Console → Admin Settings → Claude Code → Managed settings** once. Anthropic distributes it to all developers automatically.

```json
{
  "env": {
    "ASTRIX_CLIENT_TOKEN": "tok_...",
    "ASTRIX_SERVER_URL": "https://<ngrok-url>"
  },
  "extraKnownMarketplaces": {
    "astrix-managed": {
      "source": { "source": "github", "repo": "oz-shiber-astrix/claude-astrix-marketplace" }
    }
  },
  "enabledPlugins": {
    "astrix-security-hooks@astrix-managed": true
  }
}
```

---

## Policy Cache

The plugin caches org policy to `~/.claude/astrix-policy.json` on the developer's machine.

- **Written once** on first Claude Code open (or when server version changes)
- **Not re-fetched every session** — only when admin updates patterns (version increments)
- **Fails open** — if server unreachable, cached policy is used; Claude Code always starts
- **clientId-aware** — switching tokens forces a re-fetch even if version numbers match

---

## Base Blocked Patterns (All Orgs)

These are hardcoded in `pre-tool-bash.sh` and apply regardless of org config:

| Pattern | Blocks |
|---------|--------|
| `rm -rf /` / `rm -rf ~` | Recursive root/home deletion |
| `> /etc/passwd` / `> /etc/shadow` | Overwriting system auth files |
| `chmod 777 /` | World-writable root |
| `curl.*\|.*bash` / `wget.*\|.*bash` | Pipe-to-shell attacks |
| `base64.*\|.*bash` | Base64-encoded shell execution |
| `dd if=.*of=/dev/` | Direct disk writes |
| `mkfs\.` | Filesystem formatting |
| `:(){:\|:&};:` | Fork bomb |
| `AKIA[0-9A-Z]{16}` / `ghp_...` / `sk-...` | Hardcoded AWS/GitHub/OpenAI tokens |

Org-specific patterns are appended on top of these.
