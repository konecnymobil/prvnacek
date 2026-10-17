import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const dataDir = process.env.DATA_DIR ?? './data';
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
createApp({ dataDir, allowedOrigins }).listen(port, process.env.HOST ?? '0.0.0.0', () => {
  console.log(`prvnacek-sync na portu ${port}, data v ${dataDir}`);
});
