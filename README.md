# Astrix Security — Claude Code Marketplace

Official Claude Code plugin marketplace by [Astrix Security](https://astrix.security).

## Install

```bash
/plugin marketplace add astrix-security/claude-marketplace
/plugin install astrix-security-hooks@astrix-security
```

## Plugins

| Plugin | Description |
|--------|-------------|
| [`astrix-security-hooks`](./plugins/astrix-security-hooks/) | Real-time security enforcement — blocks dangerous commands, scans for secrets, audits all AI actions |

## Enterprise Deployment

See [Enterprise Deployment](#enterprise-deployment-no-mdm-required) in the plugin README for zero-MDM rollout instructions using the Claude.ai admin panel.

## Structure

```
astrix-marketplace/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace catalog (Claude Code reads this)
└── plugins/
    └── astrix-security-hooks/
        ├── .claude-plugin/
        │   └── plugin.json       # Plugin manifest
        ├── hooks/
        │   ├── hooks.json        # Hook event wiring
        │   ├── pre-tool-bash.sh  # Bash command interceptor
        │   ├── pre-tool-write.sh # File write auditor
        │   ├── prompt-scan.sh    # Secret scanner
        │   ├── config-audit.sh   # Config change auditor
        │   └── session-start.sh  # Session logger
        ├── skills/
        │   └── astrix-scan/
        │       └── SKILL.md      # Ambient security guidance for Claude
        ├── commands/
        │   └── audit-log.md      # /astrix-security-hooks:audit-log command
        └── README.md
```
