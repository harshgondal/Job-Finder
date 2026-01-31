const { createClient } = require('redis');
const { config } = require('./env');

const redisUrl = config.REDIS_URL || 'redis://127.0.0.1:6379';

const client = createClient({ url: redisUrl });
let isReady = false;

client.on('ready', () => {
  isReady = true;
  console.log('[Redis] Connected');
});

client.on('end', () => {
  isReady = false;
  console.warn('[Redis] Connection closed');
});

client.on('error', (err) => {
  isReady = false;
  console.error('[Redis] Error:', err.message);
});

async function ensureConnection() {
  if (client.isOpen) {
    return true;
  }

  try {
    await client.connect();
    return true;
  } catch (err) {
    console.error('[Redis] Failed to connect:', err.message);
    return false;
  }
}

async function getJson(key) {
  if (!key) return null;
  const connected = await ensureConnection();
  if (!connected) return null;

  const raw = await client.get(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[Redis] Failed to parse JSON for key', key, err.message);
    return null;
  }
}

async function setJson(key, value, ttlSeconds) {
  if (!key) return false;
  const connected = await ensureConnection();
  if (!connected) return false;

  const payload = JSON.stringify(value);
  if (ttlSeconds && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
    await client.set(key, payload, { EX: ttlSeconds });
  } else {
    await client.set(key, payload);
  }
  return true;
}

async function deleteKey(key) {
  if (!key) return false;
  const connected = await ensureConnection();
  if (!connected) return false;

  await client.del(key);
  return true;
}

module.exports = {
  redisClient: client,
  ensureConnection,
  getJson,
  setJson,
  deleteKey,
};
