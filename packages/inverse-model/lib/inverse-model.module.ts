import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { type DynamicModule, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import type { DataSource } from 'typeorm';
import { DatabaseModule } from './database/database.module';
import { createSchema } from './graphql/create-schema';
import { INVERSE_DATA_SOURCE } from './inverse-model.constants';
import type { InverseModelOptions } from './inverse-model.interfaces';

/**
 * Mounts a GraphQL API over an existing database: reads its tables on start
 * and exposes one `create<Table>` mutation per table.
 */
@Module({})
export class InverseModelModule {
  static forRoot(options: InverseModelOptions): DynamicModule {
    const database = DatabaseModule.forRoot(options.url);
    return {
      module: InverseModelModule,
      global: true,
      imports: [
        database,
        GraphQLModule.forRootAsync<ApolloDriverConfig>({
          driver: ApolloDriver,
          imports: [database],
          inject: [INVERSE_DATA_SOURCE],
          useFactory: (dataSource: DataSource) => ({
            ...options.graphql,
            ...createSchema(dataSource),
          }),
        }),
      ],
      exports: [database],
    };
  }
}
