import { Redis } from 'ioredis';
import { config } from '../config';

/** Shared connection for caches, rate limiting and app-level keys. */
export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });

/** BullMQ requires `maxRetriesPerRequest: null` on its connections. */
export function createBullConnection() {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
}

export const redisKeys = {
  suspended: 'uf:users:suspended',
  geocode: (key: string) => `uf:geocode:${key}`,
  geocodeThrottle: 'uf:geocode:throttle',
  aiCircuit: 'uf:ai:circuit',
  settings: 'uf:settings',
};
