import {
  type DynamicModule,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { DatabaseConnection } from '../adapters/database-adapter.interface';
import { findAdapter } from '../adapters/find-adapter';
import { withCache } from '../cache/cached-connection';
import { createRedisStore } from '../cache/redis-store';
import { INVERSE_CONNECTION } from '../inverse-model.constants';
import type { InverseModelOptions } from '../inverse-model.interfaces';
import { openRestricted, redactorFor } from '../security/secure-api';

const logger = new Logger('InverseModel');

async function connect(options: InverseModelOptions) {
  const connection = await openRestricted(options, () =>
    findAdapter(options.url).connect(options.url, { ssl: options.ssl }),
  );
  logger.log(`Read ${connection.models.length} tables or collections`);
  if (!options.cache) return connection;

  return withCache(connection, createRedisStore(options.cache.url), {
    ttl: options.cache.ttl ?? 60,
    ttlByTable: options.cache.ttlByTable ?? {},
    keyPrefix: options.cache.keyPrefix ?? 'inverse:',
    onError: (error) =>
      logger.warn(
        redactorFor(options)(
          `Cache unavailable, reading the database: ${error}`,
        ),
      ),
  });
}

/** Provides the connection opened by the adapter for the protocol of the URL, cached when asked. */
@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(INVERSE_CONNECTION) private readonly connection: DatabaseConnection,
  ) {}

  static forRoot(options: InverseModelOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: INVERSE_CONNECTION, useFactory: () => connect(options) },
      ],
      exports: [INVERSE_CONNECTION],
    };
  }

  onApplicationShutdown() {
    return this.connection.close();
  }
}
