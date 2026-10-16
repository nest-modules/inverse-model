import type {
  FieldDefinition,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import {
  assertValidNames,
  namingProblems,
  RESERVED_TYPE_NAMES,
} from '../graphql/validate-names';

const field = (property: string, name = property): FieldDefinition => ({
  name,
  property,
  type: 'Int',
  isArray: false,
  isNullable: false,
  hasDefault: false,
});

const model = (
  name: string,
  source: string,
  extra: Partial<ModelDefinition> = {},
): ModelDefinition => ({
  name,
  source,
  fields: [field('id'), field('title')],
  primaryKey: ['id'],
  relations: [],
  ...extra,
});

describe('namingProblems', () => {
  it('finds none in a schema that can be built', () => {
    expect(
      namingProblems([
        model('Author', 'public.authors'),
        model('BlogPost', 'public.blog_posts'),
        model('News', 'public.news'),
      ]),
    ).toEqual([]);
  });

  it('names both tables of a type two schemas share', () => {
    const problems = namingProblems([
      model('User', 'public.users'),
      model('User', 'audit.users'),
    ]);
    expect(problems).toContain(
      'The type User comes from more than one table: public.users (type), audit.users (type).',
    );
    // Their queries and mutations clash as well.
    expect(problems).toContain(
      'The query users comes from more than one table: public.users (list), audit.users (list).',
    );
    expect(problems).toContain(
      'The mutation createUser comes from more than one table: public.users (create mutation), audit.users (create mutation).',
    );
  });

  it('finds a type that clashes with an input of another table', () => {
    expect(
      namingProblems([
        model('Post', 'posts'),
        model('PostWhere', 'post_where'),
      ]),
    ).toContain(
      'The type PostWhere comes from more than one table: posts (filter input), post_where (type).',
    );
  });

  it('finds a list query that clashes with a by-key query of another table', () => {
    // `people` is the list of Person and the by-key query of a type People.
    expect(
      namingProblems([
        model('Person', 'person'),
        model('People', 'people_table', { plural: 'PeopleRows' }),
      ]),
    ).toContain(
      'The query people comes from more than one table: person (list), people_table (by-key query).',
    );
  });

  it.each([
    'Query',
    'Mutation',
    'Int',
    'String',
    'DateTime',
    'JSON',
    'SortDirection',
    'IntFilter',
    'NullFilter',
  ])('refuses the reserved type name %s', (name) => {
    expect(namingProblems([model(name, 'some_table')])).toContain(
      `Table some_table becomes the type ${name}, a name the API already uses.`,
    );
  });

  it('reserves every type the schema always defines', () => {
    expect([...RESERVED_TYPE_NAMES]).toEqual(
      expect.arrayContaining(['IDFilter', 'StringFilter', 'BooleanFilter']),
    );
  });

  it('refuses a query named like the health check', () => {
    expect(namingProblems([model('Health', 'healths')])).toContain(
      'Table healths becomes the by-key query health, a query the API already has.',
    );
  });

  it.each([
    ['1stQuarter', '1st_quarter'],
    ['__Secret', '__secret'],
    ['', '___'],
    ['Blog-Post', 'blog_posts'],
  ])('refuses the invalid type name "%s"', (name, source) => {
    expect(namingProblems([model(name, source)])).toContain(
      `Table ${source} becomes the type "${name}", which is not a valid GraphQL name.`,
    );
  });

  it('refuses an invalid plural', () => {
    expect(
      namingProblems([model('Post', 'posts', { plural: 'Post list' })]),
    ).toContain(
      'Table posts becomes the list "post list", which is not a valid GraphQL name.',
    );
  });

  it('finds two columns that become the same field', () => {
    expect(
      namingProblems([
        model('Post', 'posts', {
          fields: [
            field('id'),
            field('createdAt', 'created_at'),
            field('createdAt'),
          ],
        }),
      ]),
    ).toEqual([
      'Table posts: column created_at and column createdAt both become the field createdAt.',
    ]);
  });

  it('refuses invalid and reserved field names', () => {
    expect(
      namingProblems([
        model('Post', 'posts', {
          fields: [field('id'), field('2fa', '2fa'), field('AND', 'and')],
        }),
      ]),
    ).toEqual([
      'Table posts: column 2fa becomes the field "2fa", which is not a valid GraphQL name.',
      'Table posts: column and becomes the field AND, which is reserved for filters.',
    ]);
  });

  it('only counts the inputs and mutations a table gets', () => {
    // Without a primary key there is no by-key query, update or delete.
    expect(
      namingProblems([
        model('Log', 'logs', { primaryKey: [] }),
        model('UpdateLogInput', 'update_log_inputs'),
      ]),
    ).toEqual([]);
  });
});

describe('assertValidNames', () => {
  it('passes a schema that can be built', () => {
    expect(() => assertValidNames([model('Post', 'posts')])).not.toThrow();
  });

  it('lists every problem and points at the naming option', () => {
    expect(() =>
      assertValidNames([
        model('User', 'public.users'),
        model('User', 'audit.users'),
      ]),
    ).toThrow(
      /cannot be named in GraphQL:\n {2}- The type User comes from more than one table: public\.users \(type\), audit\.users \(type\)\.\n[\s\S]*`naming` option/,
    );
  });
});
