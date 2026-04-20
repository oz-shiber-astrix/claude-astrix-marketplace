const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();

// All orgs share this single static repo — no per-org repos needed.
// Plugin content is identical for every org; per-org policy is delivered via /config.
// No auth required: this endpoint is intentionally public.
const REPO_ROOT = path.join(__dirname, '../../data');

/**
 * Proxy all git HTTP protocol requests to git-http-backend CGI process.
 * Mounted at /git/marketplace.git so PATH_INFO is /marketplace.git/<rest>.
 */
router.all('*', (req, res) => {
  const env = {
    ...process.env,
    GIT_PROJECT_ROOT: REPO_ROOT,
    GIT_HTTP_EXPORT_ALL: '1',
    PATH_INFO: '/marketplace.git' + req.path,
    REQUEST_METHOD: req.method,
    QUERY_STRING: req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '',
    CONTENT_TYPE: req.headers['content-type'] || '',
    REMOTE_ADDR: req.ip || '127.0.0.1',
    SERVER_PROTOCOL: 'HTTP/1.1',
    SERVER_SOFTWARE: 'astrix-marketplace/1.0',
  };

  if (req.headers['content-length']) {
    env.CONTENT_LENGTH = req.headers['content-length'];
  }
  if (req.headers['git-protocol']) {
    env.GIT_PROTOCOL = req.headers['git-protocol'];
  }

  const proc = spawn('git', ['http-backend'], { env });

  // Pipe request body (empty for GET, git pack-data for POST)
  req.pipe(proc.stdin);

  // Parse CGI response headers then stream body
  let headersParsed = false;
  let buf = Buffer.alloc(0);

  proc.stdout.on('data', (chunk) => {
    if (headersParsed) {
      res.write(chunk);
      return;
    }
    buf = Buffer.concat([buf, chunk]);

    // CGI headers end at \r\n\r\n or \n\n
    const crlfIdx = buf.indexOf(Buffer.from('\r\n\r\n'));
    const lfIdx   = buf.indexOf(Buffer.from('\n\n'));
    let sepIdx, sepLen;
    if (crlfIdx !== -1 && (lfIdx === -1 || crlfIdx <= lfIdx)) {
      sepIdx = crlfIdx; sepLen = 4;
    } else if (lfIdx !== -1) {
      sepIdx = lfIdx; sepLen = 2;
    } else {
      return; // headers not fully buffered yet
    }

    const headerStr = buf.slice(0, sepIdx).toString();
    const body      = buf.slice(sepIdx + sepLen);
    headersParsed   = true;

    for (const line of headerStr.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      const key = line.slice(0, colon).trim();
      const val = line.slice(colon + 1).trim();
      if (key.toLowerCase() === 'status') {
        res.status(parseInt(val, 10) || 200);
      } else {
        res.setHeader(key, val);
      }
    }

    if (body.length) res.write(body);
  });

  proc.stdout.on('end', () => res.end());
  proc.stderr.on('data', (d) => console.error('[git-http-backend]', d.toString().trim()));
  proc.on('error', (err) => {
    console.error('[git-http-backend] spawn error:', err.message);
    if (!res.headersSent) res.status(500).send('git backend unavailable');
  });
});

module.exports = router;
