import { Redis } from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

const REPORT_EVERY_MS = 60_000;

function connectionHint(reason: string, tls: boolean, host = '') {
  if (/WRONGPASS|NOAUTH|invalid password/i.test(reason)) return 'Check the password in REDIS_URL.';
  if (/ENOTFOUND|EAI_AGAIN/.test(reason)) return 'Check the host name in REDIS_URL.';
  const local = !host.includes('.') || host.startsWith('127.') || host === '::1';
  if (!tls && !local) return 'Hosted Redis (e.g. Upstash) usually requires TLS: use a rediss:// URL.';
  return undefined;
}

/**
 * ioredis retries forever. Log connection problems at most once a minute, with a
 * hint for the usual misconfigurations, instead of an unhandled-error stack per retry.
 */
function monitor(client: Redis, name: string) {
  const { host, port, tls } = client.options;
  const target = { host, port, tls: Boolean(tls) };
  let ready = false;
  let lastReportAt = 0;
  const report = (reason: string) => {
    if (Date.now() - lastReportAt < REPORT_EVERY_MS) return;
    lastReportAt = Date.now();
    logger[ready ? 'warn' : 'error'](
      { redis: target, client: name, reason, hint: connectionHint(reason, target.tls, host) },
      'Redis connection failed, retrying',
    );
  };
  client.on('error', (err: Error) => report(err.message));
  // A server that hangs up without an error (a TLS-only port reached without TLS) only closes the socket.
  client.on('reconnecting', () => report('connection closed by the server'));
  client.on('ready', () => {
    if (lastReportAt || (!ready && name === 'main'))
      logger.info({ redis: target, client: name }, 'Redis connected');
    ready = true;
    lastReportAt = 0;
  });
  return client;
}

/** Shared connection for caches, rate limiting and app-level keys. */
export const redis = monitor(
  new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false }),
  'main',
);

/** BullMQ requires `maxRetriesPerRequest: null` on its connections. */
export function createBullConnection() {
  return monitor(new Redis(config.REDIS_URL, { maxRetriesPerRequest: null }), 'bullmq');
}

/**
 * Socket.IO adapter/emitter connections. Those libraries don't catch failed commands,
 * so commands wait for a reconnect instead of rejecting (which would crash the process).
 */
export function createPubSubConnection() {
  return monitor(new Redis(config.REDIS_URL, { maxRetriesPerRequest: null }), 'pubsub');
}

export const redisKeys = {
  suspended: 'uf:users:suspended',
  geocode: (key: string) => `uf:geocode:${key}`,
  geocodeThrottle: 'uf:geocode:throttle',
  aiCircuit: 'uf:ai:circuit',
  settings: 'uf:settings',
};
