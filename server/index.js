require('dotenv').config();
const { createApp } = require('./src/app');
const ngrok = require('@ngrok/ngrok');
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PORT      = parseInt(process.env.PORT || '3000', 10);
const REPO_PATH = path.join(__dirname, 'data/marketplace.git');
const REPO_SRC  = path.join(__dirname, '..');  // repo root (parent of server/)

// Only these paths are included in the distribution repo — server code stays private.
const PLUGIN_PATHS = ['plugins', '.claude-plugin', 'README.md'];

/**
 * Build a bare distribution repo containing only plugin files.
 * Uses git archive to extract a subset of the source repo, commits it into
 * a throw-away working tree, then force-pushes to the bare repo.
 * Server source code is never included.
 */
function syncGitRepo() {
  // Pull latest from GitHub before building the distribution repo
  try {
    execSync(`git -C "${REPO_SRC}" pull --ff-only`, { stdio: 'pipe' });
    console.log('[git] pulled latest from GitHub');
  } catch (err) {
    console.warn(`[git] pull failed (continuing with local HEAD): ${err.message}`);
  }

  const tmpDir = fs.mkdtempSync('/tmp/marketplace-sync-');
  try {
    // Extract only the plugin-relevant paths from the source repo
    const archive = execSync(
      `git -C "${REPO_SRC}" archive HEAD -- ${PLUGIN_PATHS.join(' ')}`,
      { maxBuffer: 50 * 1024 * 1024 }
    );

    execSync(`tar -x -C "${tmpDir}"`, { input: archive });

    // Commit the snapshot into a temporary local repo
    const GIT = `git -C "${tmpDir}" -c user.email="sync@astrix" -c user.name="Astrix Sync"`;
    execSync(`${GIT} init`, { stdio: 'pipe' });
    execSync(`${GIT} add -A`, { stdio: 'pipe' });
    execSync(`${GIT} commit -m "sync: plugin files only"`, { stdio: 'pipe' });

    // Push into the bare distribution repo (create it if needed)
    if (!fs.existsSync(REPO_PATH)) {
      fs.mkdirSync(path.dirname(REPO_PATH), { recursive: true });
      execSync(`git init --bare "${REPO_PATH}"`, { stdio: 'pipe' });
    }
    execSync(`${GIT} push --force "${REPO_PATH}" HEAD:main`, { stdio: 'pipe' });
    execSync(`git --git-dir="${REPO_PATH}" symbolic-ref HEAD refs/heads/main`, { stdio: 'pipe' });

    console.log('[git] marketplace.git synced (plugin files only)');
  } catch (err) {
    console.warn(`[git] sync failed: ${err.message}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function start() {
  syncGitRepo();

  const app = createApp();
  app.set('port', PORT);

  await new Promise((resolve, reject) => {
    app.listen(PORT, (err) => (err ? reject(err) : resolve()));
  });
  console.log(`Server listening on http://localhost:${PORT}`);

  // Start ngrok tunnel
  let publicUrl = `http://localhost:${PORT}`;
  if (process.env.NGROK_AUTHTOKEN) {
    try {
      const listener = await ngrok.forward({
        addr: PORT,
        authtoken: process.env.NGROK_AUTHTOKEN,
      });
      publicUrl = listener.url();
    } catch (err) {
      console.warn(`ngrok failed (${err.message}), continuing on localhost only`);
    }
  } else {
    console.warn('NGROK_AUTHTOKEN not set — server is localhost only');
  }

  app.set('publicUrl', publicUrl);

  const sep = '─'.repeat(60);
  console.log(`\n${sep}`);
  console.log('  Astrix Marketplace Server');
  console.log(sep);
  console.log(`  Local    http://localhost:${PORT}`);
  console.log(`  Public   ${publicUrl}`);
  console.log(`  Status   ${publicUrl}/`);
  console.log(`  Admin    ${publicUrl}/admin/clients`);
  console.log(sep);
  console.log('  Create a client:');
  console.log(`    curl -s -X POST ${publicUrl}/admin/clients \\`);
  console.log(`      -H "Authorization: Bearer $ADMIN_TOKEN" \\`);
  console.log(`      -H "Content-Type: application/json" \\`);
  console.log(`      -d '{"clientId":"acme-corp","companyName":"Acme Corp","extraBlockedPatterns":["acme_secret_.*"]}'`);
  console.log(sep);
  console.log('  Org onboarding snippet (paste into managed-settings.json):');
  console.log(`    { "extraKnownMarketplaces": { "astrix-managed": {`);
  console.log(`        "source": { "source": "git", "url": "https://<clientId>:<token>@${publicUrl.replace(/^https?:\/\//, '')}/git/marketplace.git" },`);
  console.log(`        } }, "enabledPlugins": { "astrix-security-hooks@astrix-managed": true } }`);
  console.log(`${sep}\n`);
}

start().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
