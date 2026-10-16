import 'reflect-metadata';
import { type INestApplication, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type {
  ConnectOptions,
  DatabaseConnection,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import { findAdapter } from '../adapters/find-adapter';
import { INVERSE_CONNECTION } from '../inverse-model.constants';
import type { InverseModelOptions } from '../inverse-model.interfaces';
import { InverseModelModule } from '../inverse-model.module';
import { defaultNaming } from '../utils/naming';

jest.mock('../adapters/find-adapter');

const model = (source: string, naming = defaultNaming): ModelDefinition => {
  const name = naming.type(source);
  return {
    name,
    plural: naming.plural(name),
    source,
    fields: [
      {
        name: 'id',
        property: naming.field('id', source),
        type: 'Int',
        isArray: false,
        isNullable: false,
        hasDefault: true,
      },
    ],
    primaryKey: [naming.field('id', source)],
    relations: [],
  };
};

const connect = jest.fn();
const close = jest.fn(async () => {});
/** A connection to tables of the given names, named as the options say. */
function fakeDatabase(tables: string[]) {
  connect.mockImplementation(
    async (
      _url: string,
      options: ConnectOptions,
    ): Promise<DatabaseConnection> => ({
      models: tables.map((table) => model(table, options.naming)),
      find: async () => [{ id: 1 }],
      count: async () => 1,
      findOne: async () => ({ id: 1 }),
      insert: async (_model, input) => input,
      update: async () => null,
      delete: async () => null,
      close,
    }),
  );
  jest
    .mocked(findAdapter)
    .mockReturnValue({ name: 'fake', protocols: ['fake'], connect });
}

/** Stands in for ConfigService. */
@Injectable()
class Settings {
  readonly databaseUrl = 'fake://localhost/blog';
}

@Module({ providers: [Settings], exports: [Settings] })
class SettingsModule {}

async function start(module: unknown): Promise<INestApplication> {
  @Module({ imports: [module as never] })
  class AppModule {}
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  await app.listen(0);
  return app;
}

async function query(app: INestApplication, source: string) {
  const response = await fetch(`${await app.getUrl()}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: source }),
  });
  return response.json();
}

describe('InverseModelModule', () => {
  let app: INestApplication | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    fakeDatabase(['blog_posts']);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('serves the API with options given to forRoot', async () => {
    app = await start(
      InverseModelModule.forRoot({ url: 'fake://localhost/blog' }),
    );
    expect(connect).toHaveBeenCalledWith(
      'fake://localhost/blog',
      expect.objectContaining({ naming: expect.any(Object) }),
    );
    await expect(
      query(app, '{ blogPosts { id } blogPost(id: 1) { id } }'),
    ).resolves.toEqual({
      data: { blogPosts: [{ id: 1 }], blogPost: { id: 1 } },
    });
  });

  it('reads the options from a factory with injected providers', async () => {
    app = await start(
      InverseModelModule.forRootAsync({
        imports: [SettingsModule],
        inject: [Settings],
        useFactory: (settings: Settings): InverseModelOptions => ({
          url: settings.databaseUrl,
          pagination: { maxLimit: 5 },
          naming: { type: (table) => `Db${defaultNaming.type(table)}` },
        }),
      }),
    );
    expect(connect).toHaveBeenCalledWith(
      'fake://localhost/blog',
      expect.anything(),
    );
    await expect(query(app, '{ dbBlogPostsCount }')).resolves.toEqual({
      data: { dbBlogPostsCount: 1 },
    });
    expect(app.get(INVERSE_CONNECTION).models[0].name).toBe('DbBlogPost');
  });

  it('reads the options from a factory class', async () => {
    @Injectable()
    class Options {
      createInverseModelOptions(): InverseModelOptions {
        return { url: 'fake://localhost/blog' };
      }
    }
    app = await start(InverseModelModule.forRootAsync({ useClass: Options }));
    await expect(query(app, '{ blogPostsCount }')).resolves.toEqual({
      data: { blogPostsCount: 1 },
    });
  });

  it('fails to start when two tables get the same name, closing the connection', async () => {
    fakeDatabase(['public.users', 'audit.users']);
    await expect(
      start(InverseModelModule.forRoot({ url: 'fake://localhost/blog' })),
    ).rejects.toThrow(
      /The type User comes from more than one table: public\.users \(type\), audit\.users \(type\)/,
    );
    expect(close).toHaveBeenCalled();
  });

  it('starts once the naming option tells the tables apart', async () => {
    fakeDatabase(['public.users', 'audit.users']);
    app = await start(
      InverseModelModule.forRoot({
        url: 'fake://localhost/blog',
        naming: {
          type: (table) =>
            table === 'audit.users' ? 'AuditUser' : defaultNaming.type(table),
        },
      }),
    );
    await expect(query(app, '{ usersCount auditUsersCount }')).resolves.toEqual(
      { data: { usersCount: 1, auditUsersCount: 1 } },
    );
  });
});
