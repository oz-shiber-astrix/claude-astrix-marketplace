const fs = require('fs-extra');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/clients.json');

async function loadClients() {
  const raw = await fs.readFile(DATA_FILE, 'utf8').catch(() => '{}');
  return raw.trim() ? JSON.parse(raw) : {};
}

function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization: Bearer <token> header' });
  }
  const token = authHeader.slice(7);
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Invalid admin token' });
  }
  next();
}

async function clientTokenAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization: Bearer <token> header' });
  }
  const token = authHeader.slice(7);

  try {
    const clients = await loadClients();
    const client = Object.values(clients).find(c => c.token === token);
    if (!client) {
      return res.status(401).json({ error: 'Invalid client token' });
    }
    req.client = client;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Auth check failed' });
  }
}

module.exports = { adminAuth, clientTokenAuth };
