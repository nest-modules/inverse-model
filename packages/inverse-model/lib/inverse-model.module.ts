import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { type DynamicModule, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import type { DatabaseConnection } from './adapters/database-adapter.interface';
import { DatabaseModule } from './database/database.module';
import { createSchema } from './graphql/create-schema';
import { INVERSE_CONNECTION } from './inverse-model.constants';
import type { InverseModelOptions } from './inverse-model.interfaces';

/**
 * Mounts a GraphQL API over an existing database: on start the adapter for
 * the protocol of the URL reads its tables or collections, and one
 * `create<Model>` mutation is exposed per table or collection.
 */
@Module({})
export class InverseModelModule {
  static forRoot(options: InverseModelOptions): DynamicModule {
    const database = DatabaseModule.forRoot(options.url, options.adapters);
    return {
      module: InverseModelModule,
      global: true,
      imports: [
        database,
        GraphQLModule.forRootAsync<ApolloDriverConfig>({
          driver: ApolloDriver,
          imports: [database],
          inject: [INVERSE_CONNECTION],
          useFactory: (connection: DatabaseConnection) => ({
            ...options.graphql,
            ...createSchema(connection),
          }),
        }),
      ],
      exports: [database],
    };
  }
}
