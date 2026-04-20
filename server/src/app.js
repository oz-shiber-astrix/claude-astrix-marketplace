const express = require('express');
const adminRouter = require('./routes/admin');
const configRouter = require('./routes/config');
const gitRouter   = require('./routes/git');
const statusRouter = require('./routes/status');

function createApp() {
  const app = express();

  // Admin CRUD API — protected by ADMIN_TOKEN
  app.use('/admin', adminRouter);

  // Client config endpoint — protected by per-client token (?token= or Bearer)
  app.use('/config', configRouter);

  // Git HTTP backend — serves static marketplace.git to all orgs
  app.use('/git/marketplace.git', gitRouter);

  // Status / dashboard page
  app.use('/', statusRouter);

  return app;
}

module.exports = { createApp };
