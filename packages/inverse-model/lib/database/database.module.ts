import {
  type DynamicModule,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type {
  DatabaseAdapter,
  DatabaseConnection,
} from '../adapters/database-adapter.interface';
import { findAdapter } from '../adapters/find-adapter';
import { INVERSE_CONNECTION } from '../inverse-model.constants';

/** Provides the connection opened by the adapter for the protocol of the URL. */
@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(INVERSE_CONNECTION) private readonly connection: DatabaseConnection,
  ) {}

  static forRoot(
    url: string,
    adapters: readonly DatabaseAdapter[] = [],
  ): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: INVERSE_CONNECTION,
          useFactory: () => findAdapter(url, adapters).connect(url),
        },
      ],
      exports: [INVERSE_CONNECTION],
    };
  }

  onApplicationShutdown() {
    return this.connection.close();
  }
}
