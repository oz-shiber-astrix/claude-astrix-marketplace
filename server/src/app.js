const express = require('express');
const { adminAuth } = require('./middleware/auth');
const adminRouter = require('./routes/admin');
const configRouter = require('./routes/config');
const statusRouter = require('./routes/status');

function createApp() {
  const app = express();

  // Admin CRUD API — protected by ADMIN_TOKEN
  app.use('/admin', adminRouter);

  // Client config endpoint — protected by per-client token
  app.use('/config', configRouter);

  // Status / dashboard page
  app.use('/', statusRouter);

  return app;
}

module.exports = { createApp };
