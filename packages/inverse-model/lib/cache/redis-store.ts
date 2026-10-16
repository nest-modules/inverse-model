import type { CacheStore } from './cache-store.interface';

/** Redis through ioredis; needs the `ioredis` package. */
export function createRedisStore(url: string): CacheStore {
  // Required here so ioredis is only needed by apps that turn the cache on.
  const { Redis } = require('ioredis') as typeof import('ioredis');
  const redis = new Redis(url, { maxRetriesPerRequest: 1 });
  return {
    get: (key) => redis.get(key),
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, 'EX', ttlSeconds);
    },
    increment: (key) => redis.incr(key),
    async close() {
      await redis.quit();
    },
  };
}
