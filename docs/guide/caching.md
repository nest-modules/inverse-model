# Caching

Query results can be cached in Redis. Install `ioredis` and give the cache a URL:

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  cache: {
    url: process.env.REDIS_URL!,
    ttl: 60, // seconds
    ttlByTable: { audit_logs: 0, countries: 3600 },
  },
});
```

| Option | Default | What it does |
|---|---|---|
| `cache.url` | (no cache) | Redis connection string. |
| `cache.ttl` | `60` | Seconds a result is kept. |
| `cache.ttlByTable` | `{}` | TTL per table or collection name; `0` leaves a table uncached. |
| `cache.keyPrefix` | `inverse:` | Prefix of every key the cache writes. |

## What is cached

Lists, counts, lookups by key, connections and relation batches. Each result is keyed by its table, its arguments and, when [`scope`](./security#scope) is set, the scope, so tenants never share results.

## Invalidation

A mutation clears the cached results of the table it wrote to, without touching other tables. Inside a [transaction](./extending#transactions), tables are cleared once it is over, never before it commits, so no reader caches what was there before.

Each table has a version number in Redis that is part of every key, and a write increments it. Old results are never read again and expire on their own, so invalidation is a single Redis command however many results a table has.

A query that filters by a relation is also cleared by writes to the related table.

## When Redis is down

Reads go to the database and a warning is logged. The API keeps working, just without the cache.

## Writes from outside the API

The cache only knows about writes made through the API. If other systems write to the same tables, use a short `ttl` for those tables, or `0` to leave them uncached.
