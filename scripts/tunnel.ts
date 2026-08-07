import 'dotenv/config';
import ngrok from '@ngrok/ngrok';

if (!process.env.NGROK_AUTHTOKEN) {
  console.error('NGROK_AUTHTOKEN must be set in .env (get it from your ngrok.com dashboard).');
  process.exit(1);
}

const listener = await ngrok.forward({ addr: 3000, authtoken_from_env: true });
const url = listener.url();

console.log(`Tunnel ready: ${url}`);
console.log(`Webhook URL for Telegram setWebhook: ${url}/webhooks/telegram`);
console.log('Press Ctrl+C to stop.');

// Keep the process alive via a timer handle - the tunnel closes when this
// process exits. (An unsettled top-level await alone gets force-exited by
// Node's "unsettled top-level await" detection, exit code 13.)
setInterval(() => {}, 1 << 30);
