/** Key-value store the cache keeps query results in. */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Adds one to the number at `key`, starting from 0, and returns it. */
  increment(key: string): Promise<number>;
  close(): Promise<void>;
}
