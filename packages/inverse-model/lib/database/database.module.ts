import {
  type DynamicModule,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { INVERSE_DATA_SOURCE } from '../inverse-model.constants';
import { createDataSource } from './create-data-source';

/** Provides the TypeORM data source built from the database itself. */
@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(INVERSE_DATA_SOURCE) private readonly dataSource: DataSource,
  ) {}

  static forRoot(url: string): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: INVERSE_DATA_SOURCE,
          useFactory: () => createDataSource(url),
        },
      ],
      exports: [INVERSE_DATA_SOURCE],
    };
  }

  onApplicationShutdown() {
    return this.dataSource.destroy();
  }
}
