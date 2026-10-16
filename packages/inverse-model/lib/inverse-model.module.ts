import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { type DynamicModule, Logger, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import type { DatabaseConnection } from './adapters/database-adapter.interface';
import { DatabaseModule } from './database/database.module';
import { createSchema } from './graphql/create-schema';
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
    const database = DatabaseModule.forRoot(options);
    const pagination = {
      defaultLimit: options.pagination?.defaultLimit ?? 100,
      maxLimit: options.pagination?.maxLimit ?? 1000,
    };
    return {
      module: InverseModelModule,
      global: true,
      imports: [
        database,
        GraphQLModule.forRootAsync<ApolloDriverConfig>({
          driver: ApolloDriver,
          imports: [database],
          inject: [INVERSE_CONNECTION],
          useFactory: (connection: DatabaseConnection) =>
            secureGraphQL(
              connection,
              options,
              pagination,
              new Logger('InverseModel'),
              (scoped) => ({
                ...options.graphql,
                ...createSchema(scoped, pagination),
              }),
            ),
        }),
      ],
      exports: [database],
    };
  }
}
