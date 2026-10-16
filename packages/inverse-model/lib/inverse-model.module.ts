import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { type DynamicModule, Logger, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import type { DatabaseConnection } from './adapters/database-adapter.interface';
import { DatabaseModule } from './database/database.module';
import {
  INVERSE_MODEL_OPTIONS,
  type InverseModelAsyncOptions,
} from './database/database.module-definition';
import {
  extendSchema,
  modelLookup,
  schemaOptions,
} from './extend/extend-schema';
import { createSchema } from './graphql/create-schema';
import { createWrites } from './hooks/writes';
import { INVERSE_CONNECTION } from './inverse-model.constants';
import type { InverseModelOptions } from './inverse-model.interfaces';
import { secureGraphQL } from './security/secure-api';

/**
 * Mounts a GraphQL API over an existing database: on start it reads the
 * tables or collections behind the URL, their keys and foreign keys, and
 * serves queries, mutations and relations for all of them.
 */
@Module({})
export class InverseModelModule {
  static forRoot(options: InverseModelOptions): DynamicModule {
    return InverseModelModule.over(DatabaseModule.forRoot(options));
  }

  /** Like forRoot, with the options from a factory, e.g. one that reads ConfigService. */
  static forRootAsync(options: InverseModelAsyncOptions): DynamicModule {
    return InverseModelModule.over(DatabaseModule.forRootAsync(options));
  }

  private static over(database: DynamicModule): DynamicModule {
    return {
      module: InverseModelModule,
      global: true,
      imports: [
        database,
        GraphQLModule.forRootAsync<ApolloDriverConfig>({
          driver: ApolloDriver,
          imports: [database],
          inject: [INVERSE_CONNECTION, INVERSE_MODEL_OPTIONS],
          useFactory: (
            connection: DatabaseConnection,
            options: InverseModelOptions,
          ) => {
            const pagination = {
              defaultLimit: options.pagination?.defaultLimit ?? 100,
              maxLimit: options.pagination?.maxLimit ?? 1000,
            };
            const { typeDefs, resolvers, ...config } = secureGraphQL(
              connection,
              options,
              pagination,
              new Logger('InverseModel'),
              (scoped) => {
                // Writes go through the scoped connection, so hooks never reach another tenant's rows.
                const writes = createWrites(scoped, options.hooks);
                return {
                  ...options.graphql,
                  ...extendSchema(
                    createSchema(scoped, pagination, writes),
                    options.extend,
                    { connection: scoped, model: modelLookup(scoped), writes },
                  ),
                };
              },
            );
            // Secured first, then merged with any code-first resolvers Nest discovers.
            return {
              ...config,
              ...schemaOptions(
                {
                  typeDefs: typeDefs as string,
                  resolvers: resolvers as Parameters<
                    typeof schemaOptions
                  >[0]['resolvers'],
                },
                options.graphql?.transformResolvers,
              ),
            };
          },
        }),
      ],
      exports: [database],
    };
  }
}
