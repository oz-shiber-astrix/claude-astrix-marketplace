require('dotenv').config();
const { createApp } = require('./src/app');
const ngrok = require('@ngrok/ngrok');

const PORT = parseInt(process.env.PORT || '3000', 10);

async function start() {
  const app = createApp();
  app.set('port', PORT);

  await new Promise((resolve, reject) => {
    app.listen(PORT, (err) => (err ? reject(err) : resolve()));
  });
  console.log(`Server listening on http://localhost:${PORT}`);

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
  console.log(`${sep}\n`);
}

start().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
