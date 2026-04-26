const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(adminAuth);
router.use(express.json());

const DATA_FILE = path.join(__dirname, '../../data/clients.json');

async function loadClients() {
  await fs.ensureFile(DATA_FILE);
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  return raw.trim() ? JSON.parse(raw) : {};
}

async function saveClients(clients) {
  await fs.outputJson(DATA_FILE, clients, { spaces: 2 });
}

function generateToken() {
  return 'tok_' + crypto.randomBytes(24).toString('hex');
}

/**
 * The snippet IT pastes into /etc/claude-code/managed-settings.json (or
 * Claude.ai Admin Console → Managed settings for Teams/Enterprise).
 * No env vars needed — the token is embedded in the marketplace git URL.
 * Claude Code distributes this to every developer automatically.
 */
function buildSettingsSnippet(token, serverUrl) {
  const repoUrl = process.env.GITHUB_REPO_URL || 'https://github.com/YOUR_ORG/YOUR_REPO';
  const deployToken = process.env.GITHUB_DEPLOY_TOKEN || 'SET_GITHUB_DEPLOY_TOKEN_IN_SERVER_ENV';
  const gitUrl = repoUrl.replace('https://', `https://x-access-token:${deployToken}@`);

  return {
    extraKnownMarketplaces: {
      'astrix-managed': {
        source: { source: 'git', url: gitUrl },
      },
    },
    enabledPlugins: {
      'astrix-security-hooks@astrix-managed': true,
    },
    env: {
      ASTRIX_GITHUB_TOKEN: deployToken,
      ASTRIX_SERVER_URL: serverUrl,
      ASTRIX_CLIENT_TOKEN: token,
    },
  };
}

function maskToken(token) {
  return token.slice(0, 12) + '...' + token.slice(-4);
}

function clientResponse(client, serverUrl) {
  const snippet = buildSettingsSnippet(client.token, serverUrl);
  return {
    clientId: client.clientId,
    companyName: client.companyName,
    extraBlockedPatterns: client.extraBlockedPatterns,
    version: client.version || 1,
    token: client.token,
    tokenMasked: maskToken(client.token),
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    managedSettingsSnippet: snippet,
  };
}

// POST /admin/clients — create a new client, returns token
router.post('/clients', async (req, res) => {
  try {
    const { clientId, companyName, extraBlockedPatterns = [] } = req.body || {};

    if (!clientId || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(clientId)) {
      return res.status(400).json({
        error: 'clientId must be lowercase alphanumeric with hyphens (e.g. "acme-corp")',
      });
    }

    const clients = await loadClients();
    if (clients[clientId]) {
      return res.status(409).json({ error: `Client '${clientId}' already exists` });
    }

    const now = new Date().toISOString();
    const client = {
      clientId,
      companyName: companyName || clientId,
      token: generateToken(),
      extraBlockedPatterns,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    clients[clientId] = client;
    await saveClients(clients);

    const serverUrl = req.app.get('publicUrl') || `http://localhost:${req.app.get('port')}`;
    console.log(`[admin] Created client '${clientId}' token=${maskToken(client.token)}`);
    res.status(201).json(clientResponse(client, serverUrl));
  } catch (err) {
    console.error('[admin] Create client error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/clients — list all clients
router.get('/clients', async (req, res) => {
  try {
    const clients = await loadClients();
    const serverUrl = req.app.get('publicUrl') || `http://localhost:${req.app.get('port')}`;
    res.json(Object.values(clients).map(c => clientResponse(c, serverUrl)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/clients/:id — get one client
router.get('/clients/:id', async (req, res) => {
  try {
    const clients = await loadClients();
    const client = clients[req.params.id];
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const serverUrl = req.app.get('publicUrl') || `http://localhost:${req.app.get('port')}`;
    res.json(clientResponse(client, serverUrl));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/clients/:id — update blocked patterns
router.put('/clients/:id', async (req, res) => {
  try {
    const clients = await loadClients();
    const existing = clients[req.params.id];
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    const { companyName, extraBlockedPatterns } = req.body || {};
    const updated = {
      ...existing,
      companyName: companyName ?? existing.companyName,
      extraBlockedPatterns: extraBlockedPatterns ?? existing.extraBlockedPatterns,
      version: (existing.version || 1) + 1,
      updatedAt: new Date().toISOString(),
    };

    clients[existing.clientId] = updated;
    await saveClients(clients);

    const serverUrl = req.app.get('publicUrl') || `http://localhost:${req.app.get('port')}`;
    console.log(`[admin] Updated client '${existing.clientId}'`);
    res.json(clientResponse(updated, serverUrl));
  } catch (err) {
    console.error('[admin] Update client error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/clients/:id/rotate-token — issue a new token
router.post('/clients/:id/rotate-token', async (req, res) => {
  try {
    const clients = await loadClients();
    const existing = clients[req.params.id];
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    const updated = { ...existing, token: generateToken(), updatedAt: new Date().toISOString() };
    clients[existing.clientId] = updated;
    await saveClients(clients);

    const serverUrl = req.app.get('publicUrl') || `http://localhost:${req.app.get('port')}`;
    console.log(`[admin] Rotated token for '${existing.clientId}'`);
    res.json(clientResponse(updated, serverUrl));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/clients/:id — remove client
router.delete('/clients/:id', async (req, res) => {
  try {
    const clients = await loadClients();
    if (!clients[req.params.id]) return res.status(404).json({ error: 'Client not found' });

    delete clients[req.params.id];
    await saveClients(clients);

    console.log(`[admin] Deleted client '${req.params.id}'`);
    res.json({ message: `Client '${req.params.id}' deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
