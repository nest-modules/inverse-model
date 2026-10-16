import type {
  DatabaseConnection,
  FieldDefinition,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import { findAdapter } from '../adapters/find-adapter';

// Each database comes from compose.yaml with the blog sample loaded; one without a URL is skipped.
const DATABASES = [
  ['postgres', process.env.POSTGRES_URL],
  ['mysql', process.env.MYSQL_URL],
  ['mariadb', process.env.MARIADB_URL],
  ['mongodb', process.env.MONGODB_URL],
] as const;

describe.each(DATABASES)('%s adapter', (name, url) => {
  const run = url ? it : it.skip;
  let connection: DatabaseConnection;
  let authors: ModelDefinition;
  const field = (property: string) =>
    authors.fields.find((candidate) => candidate.property === property) as
      | FieldDefinition
      | undefined;

  beforeAll(async () => {
    if (!url) return;
    connection = await findAdapter(url).connect(url);
    authors = connection.models.find(
      (model) => model.name === 'Authors',
    ) as ModelDefinition;
  });

  afterAll(() => connection?.close());

  run('is picked for its URL', () => {
    expect(findAdapter(url as string).name).toBe(name);
  });

  run('reads the tables or collections of the blog', () => {
    expect(connection.models.map((model) => model.name).sort()).toEqual([
      'Authors',
      'BlogPosts',
    ]);
  });

  run('reads the fields of a model', () => {
    expect(field('id')).toMatchObject({ hasDefault: true, isNullable: false });
    expect(field('fullName')).toMatchObject({
      name: 'full_name',
      type: 'String',
    });
    expect(field('email')?.type).toBe('String');
    expect(field('createdAt')?.type).toBe('DateTime');
  });

  run('inserts a record and returns its generated id', async () => {
    const email = `${name}-${Date.now()}@example.com`;
    const created = await connection.insert(authors, {
      fullName: 'Ada',
      email,
    });
    expect(created).toMatchObject({ fullName: 'Ada', email });
    expect(created.id).toBeDefined();
  });
});
