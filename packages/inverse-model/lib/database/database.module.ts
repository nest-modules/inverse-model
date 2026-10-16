import {
  type DynamicModule,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';
import type { DatabaseConnection } from '../adapters/database-adapter.interface';
import { findAdapter } from '../adapters/find-adapter';
import { withCache } from '../cache/cached-connection';
import { createRedisStore } from '../cache/redis-store';
import { assertValidNames } from '../graphql/validate-names';
import { INVERSE_CONNECTION } from '../inverse-model.constants';
import type { InverseModelOptions } from '../inverse-model.interfaces';
import { withRenames } from '../rename/with-renames';
import { openRestricted, redactorFor } from '../security/secure-api';
import { resolveNaming } from '../utils/naming';
import {
  ConfigurableModuleClass,
  INVERSE_MODEL_OPTIONS,
  type InverseModelAsyncOptions,
} from './database.module-definition';

const logger = new Logger('InverseModel');

async function connect(options: InverseModelOptions) {
  const connection = await openRestricted(options, async () => {
    const opened = await findAdapter(options.url).connect(options.url, {
      ssl: options.ssl,
      naming: resolveNaming(options.naming),
    });
    return options.rename ? withRenames(opened, options.rename) : opened;
  });
  // Only the exposed models need unique names; a hidden table cannot collide.
  try {
    assertValidNames(connection.models);
  } catch (error) {
    await connection.close();
    throw error;
  }
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

const connectionProvider: Provider = {
  provide: INVERSE_CONNECTION,
  inject: [INVERSE_MODEL_OPTIONS],
  useFactory: connect,
};

/** Adds the connection to the options module the builder makes. */
function withConnection(module: DynamicModule): DynamicModule {
  return {
    ...module,
    providers: [...(module.providers ?? []), connectionProvider],
    exports: [INVERSE_MODEL_OPTIONS, INVERSE_CONNECTION],
  };
}

/** Provides the options and the connection opened by the adapter for the protocol of the URL, cached when asked. */
@Module({})
export class DatabaseModule
  extends ConfigurableModuleClass
  implements OnApplicationShutdown
{
  constructor(
    @Inject(INVERSE_CONNECTION) private readonly connection: DatabaseConnection,
  ) {
    super();
  }

  static forRoot(options: InverseModelOptions): DynamicModule {
    // biome-ignore lint/complexity/noThisInStatic: through super, the builder makes DatabaseModule the module of the result.
    return withConnection(super.forRoot(options));
  }

  static forRootAsync(options: InverseModelAsyncOptions): DynamicModule {
    // biome-ignore lint/complexity/noThisInStatic: through super, the builder makes DatabaseModule the module of the result.
    return withConnection(super.forRootAsync(options));
  }

  onApplicationShutdown() {
    return this.connection.close();
  }
}
