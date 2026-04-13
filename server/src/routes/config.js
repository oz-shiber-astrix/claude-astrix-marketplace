const express = require('express');
const { clientTokenAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /config
 * Client presents their bearer token; receives their blocked patterns.
 * Called by session-start.sh at the start of every Claude Code session.
 */
router.get('/', clientTokenAuth, (req, res) => {
  const { clientId, companyName, extraBlockedPatterns, version } = req.client;
  res.json({
    clientId,
    companyName,
    blockedPatterns: extraBlockedPatterns || [],
    version: version || 1,
  });
});

module.exports = router;
