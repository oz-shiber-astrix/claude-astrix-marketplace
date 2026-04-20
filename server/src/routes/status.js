const express = require('express');
const fs = require('fs-extra');
const path = require('path');

const router = express.Router();
const DATA_FILE = path.join(__dirname, '../../data/clients.json');

router.get('/', async (req, res) => {
  let clients = {};
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    clients = raw.trim() ? JSON.parse(raw) : {};
  } catch (_) {}

  const serverUrl = req.app.get('publicUrl') || `http://localhost:${req.app.get('port')}`;
  const clientList = Object.values(clients);

  const rows = clientList.length
    ? clientList.map(c => {
        const masked = c.token ? c.token.slice(0, 12) + '...' + c.token.slice(-4) : '(no token)';
        const snippet = JSON.stringify({
          extraKnownMarketplaces: {
            'astrix-managed': {
              source: {
                source: 'git',
                url: (() => { const u = new URL('/git/marketplace.git', serverUrl); u.username = c.clientId; u.password = c.token || '(regenerate)'; return u.href; })(),
              },
              },
          },
          enabledPlugins: {
            'astrix-security-hooks@astrix-managed': true,
          },
        }, null, 2);
        return `
          <tr>
            <td>${esc(c.clientId)}</td>
            <td>${esc(c.companyName)}</td>
            <td>${esc((c.extraBlockedPatterns || []).join('\n') || '—')}</td>
            <td><code>${esc(masked)}</code></td>
            <td><pre style="margin:0;font-size:0.8em">${esc(snippet)}</pre></td>
            <td>${esc(c.updatedAt)}</td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="6" style="text-align:center;color:#888">No clients yet — use the Admin API to create one.</td></tr>';

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Astrix Marketplace Server</title>
  <style>
    body { font-family: monospace; padding: 2rem; background: #0d1117; color: #c9d1d9; }
    h1 { color: #58a6ff; }
    h2 { color: #8b949e; font-size: 1rem; font-weight: normal; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
    th { background: #161b22; color: #58a6ff; padding: 0.5rem 1rem; text-align: left; border: 1px solid #30363d; }
    td { padding: 0.5rem 1rem; border: 1px solid #30363d; vertical-align: top; }
    code { background: #161b22; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
    pre  { background: #161b22; padding: 0.5rem; border-radius: 4px; font-size: 0.8em; word-break: break-all; }
    .api { background: #161b22; padding: 1rem; border-radius: 6px; margin-top: 1.5rem; }
    .api h3 { color: #58a6ff; margin-top: 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; margin-right: 4px; }
    .post { background: #1a3a1a; color: #56d364; }
    .get  { background: #1a2a3a; color: #79c0ff; }
    .put  { background: #3a2a1a; color: #e3b341; }
    .del  { background: #3a1a1a; color: #f85149; }
  </style>
</head>
<body>
  <h1>Astrix Marketplace Server</h1>
  <h2>Token-based per-client security policy distribution</h2>

  <p>Server: <code>${esc(serverUrl)}</code> &nbsp;|&nbsp; Clients: <strong>${clientList.length}</strong></p>

  <table>
    <thead>
      <tr>
        <th>Client ID</th>
        <th>Company</th>
        <th>Extra Blocked Patterns</th>
        <th>Token</th>
        <th>Paste into managed-settings.json / Claude.ai Admin Console</th>
        <th>Last Updated</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="api">
    <h3>Admin API — <code>Authorization: Bearer $ADMIN_TOKEN</code></h3>
    <p><span class="badge post">POST</span> <code>/admin/clients</code> — <code>{"clientId","companyName","extraBlockedPatterns":[]}</code></p>
    <p><span class="badge get">GET</span> <code>/admin/clients</code> &nbsp; <span class="badge get">GET</span> <code>/admin/clients/:id</code></p>
    <p><span class="badge put">PUT</span> <code>/admin/clients/:id</code> — update patterns/name</p>
    <p><span class="badge post">POST</span> <code>/admin/clients/:id/rotate-token</code> — issue new token</p>
    <p><span class="badge del">DELETE</span> <code>/admin/clients/:id</code></p>
    <h3 style="margin-top:1rem">Client config endpoint — <code>?token=&lt;clientToken&gt;</code> or <code>Authorization: Bearer</code></h3>
    <p><span class="badge get">GET</span> <code>/config?token=…</code> — returns <code>{"clientId","companyName","blockedPatterns":[],"version":N}</code></p>
    <h3 style="margin-top:1rem">Marketplace git endpoint — <code>Authorization: Basic x:&lt;clientToken&gt;</code></h3>
    <p><span class="badge get">GET</span> <code>https://x:&lt;token&gt;@&lt;host&gt;/git/marketplace.git</code> — token-authenticated git clone/pull</p>
  </div>
</body>
</html>`);
});

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = router;
