import { loadConfig } from './dist/core/config.js';
import { buildServer } from './dist/server/app.js';
import { randomBytes } from 'node:crypto';
import { initializeDesktopMasterKey } from './dist/core/ai-secrets.js';

if (!process.send) throw new Error('Desktop backend requires a private IPC channel');
const masterKey = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Desktop configuration timed out')), 15000);
  process.once('message', message => {
    clearTimeout(timer);
    if (message?.type === 'configure' && /^[a-f0-9]{64}$/i.test(message.masterKey)) resolve(message.masterKey);
    else reject(new Error('Invalid desktop configuration'));
  });
  process.once('disconnect', () => { clearTimeout(timer); reject(new Error('Desktop disconnected')); });
});
initializeDesktopMasterKey(masterKey);

const config = loadConfig({ host: '127.0.0.1' });
const accessToken = randomBytes(32).toString('hex');
const server = await buildServer(config, { accessToken });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  process.exit(0);
}
process.on('message', message => { if (message?.type === 'shutdown') void close(); });
process.on('disconnect', () => void close());
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
await server.listen({ host: '127.0.0.1', port: 0 });
process.send?.({ type: 'ready', port: server.server.address().port, accessToken });
