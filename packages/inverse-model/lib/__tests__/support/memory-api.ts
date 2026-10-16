import { ApolloServer } from '@apollo/server';
import type {
  DatabaseConnection,
  DatabaseRecord,
  FieldDefinition,
  FieldFilter,
  ModelDefinition,
  Where,
} from '../../adapters/database-adapter.interface';
import { addRelations } from '../../adapters/relations';
import { createSchema } from '../../graphql/create-schema';
import { createWrites } from '../../hooks/writes';
import type { InverseModelOptions } from '../../inverse-model.interfaces';
import { openRestricted, secureGraphQL } from '../../security/secure-api';

const field = (
  name: string,
  property: string,
  type: FieldDefinition['type'],
  extra: Partial<FieldDefinition> = {},
): FieldDefinition => ({
  name,
  property,
  type,
  isArray: false,
  isNullable: false,
  hasDefault: false,
  ...extra,
});

/** Authors and their posts per tenant, as PostgreSQL names them, plus a keyless log. */
export function tenantModels(): ModelDefinition[] {
  const authors: ModelDefinition = {
    name: 'Authors',
    source: 'public.authors',
    fields: [
      field('id', 'id', 'Int', { hasDefault: true }),
      field('full_name', 'fullName', 'String'),
      field('tenant_id', 'tenantId', 'Int'),
      field('password_hash', 'passwordHash', 'String', { isNullable: true }),
    ],
    primaryKey: ['id'],
    relations: [],
  };
  const posts: ModelDefinition = {
    name: 'BlogPosts',
    source: 'public.blog_posts',
    fields: [
      field('id', 'id', 'Int', { hasDefault: true }),
      field('author_id', 'authorId', 'Int'),
      field('title', 'title', 'String'),
      field('tenant_id', 'tenantId', 'Int'),
    ],
    primaryKey: ['id'],
    relations: [],
  };
  const logs: ModelDefinition = {
    name: 'AuditLogs',
    source: 'public.audit_logs',
    fields: [field('message', 'message', 'String')],
    primaryKey: [],
    relations: [],
  };
  addRelations([
    {
      source: posts,
      fields: ['authorId'],
      target: authors,
      references: ['id'],
    },
  ]);
  return [authors, posts, logs];
}

const matches = (record: DatabaseRecord, where?: Where | null): boolean =>
  !where ||
  Object.entries(where).every(([key, value]) => {
    if (value === null || value === undefined) return true;
    if (key === 'AND')
      return (value as Where[]).every((w) => matches(record, w));
    if (key === 'OR') return (value as Where[]).some((w) => matches(record, w));
    if (key === 'NOT') return !matches(record, value as Where);
    const filter = value as FieldFilter;
    const actual = record[key];
    return (
      (filter.eq == null || String(actual) === String(filter.eq)) &&
      (filter.in == null || filter.in.map(String).includes(String(actual))) &&
      (filter.contains == null ||
        String(actual).toLowerCase().includes(filter.contains.toLowerCase()))
    );
  });

/** Enough of a database for the API, with every call recorded. */
export function memoryConnection(models: ModelDefinition[]) {
  const tables = new Map<string, DatabaseRecord[]>();
  const rows = (model: ModelDefinition) => {
    if (!tables.has(model.source)) tables.set(model.source, []);
    return tables.get(model.source) as DatabaseRecord[];
  };
  let nextId = 0;
  const byKey = (model: ModelDefinition, key: DatabaseRecord) =>
    rows(model).find((row) =>
      model.primaryKey.every((property) => row[property] === key[property]),
    ) ?? null;

  const connection: DatabaseConnection = {
    models,
    find: jest.fn(async (model, { where, orderBy, limit, offset }) => {
      const found = rows(model).filter((row) => matches(row, where));
      for (const entry of [...(orderBy ?? [])].reverse()) {
        const [[property, direction]] = Object.entries(entry);
        const sign = direction === 'ASC' ? 1 : -1;
        found.sort((a, b) =>
          (a[property] as number) > (b[property] as number) ? sign : -sign,
        );
      }
      return found.slice(offset ?? 0, (offset ?? 0) + (limit ?? found.length));
    }),
    count: jest.fn(
      async (model, where) =>
        rows(model).filter((row) => matches(row, where)).length,
    ),
    findOne: jest.fn(async (model, key) => byKey(model, key)),
    insert: jest.fn(async (model, input) => {
      const record = {
        ...(model.primaryKey.includes('id') ? { id: ++nextId } : {}),
        ...input,
      };
      rows(model).push(record);
      return record;
    }),
    update: jest.fn(async (model, key, input) => {
      const record = byKey(model, key);
      if (record) Object.assign(record, input);
      return record;
    }),
    delete: jest.fn(async (model, key) => {
      const record = byKey(model, key);
      if (record) rows(model).splice(rows(model).indexOf(record), 1);
      return record;
    }),
    upsert: jest.fn(async (model, input) => {
      const record = byKey(model, input);
      if (record) return Object.assign(record, input);
      return connection.insert(model, input);
    }),
    insertMany: jest.fn(async (model, inputs) => {
      for (const input of inputs) await connection.insert(model, input);
      return inputs.length;
    }),
    deleteMany: jest.fn(async (model, where) => {
      const doomed = rows(model).filter((row) => matches(row, where));
      for (const row of doomed) rows(model).splice(rows(model).indexOf(row), 1);
      return doomed.length;
    }),
    nullsFirst: true,
    close: async () => {},
  };
  return connection;
}

export interface Response {
  data?: Record<string, any> | null;
  errors?: { message: string; extensions?: Record<string, any> }[];
}

/**
 * The API as the module serves it: the connection narrowed by the options,
 * then Apollo with the secured schema. Returns a function that runs a query.
 */
export const logger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

export async function serve(
  connection: DatabaseConnection,
  options: Omit<InverseModelOptions, 'url'> & { url?: string } = {},
) {
  const settings = { url: 'postgres://app:s3cret-pw@db/blog', ...options };
  const pagination = { defaultLimit: 10, maxLimit: 50 };
  const restricted = await openRestricted(settings, async () => connection);
  const config = secureGraphQL(
    restricted,
    settings,
    pagination,
    logger,
    (scoped) => ({
      ...settings.graphql,
      ...createSchema(scoped, pagination, createWrites(scoped, settings.hooks)),
    }),
  );
  const server = new ApolloServer({
    typeDefs: config.typeDefs as string,
    resolvers: config.resolvers as any,
    validationRules: config.validationRules,
    formatError: config.formatError,
    includeStacktraceInErrorResponses: false,
  });
  await server.start();
  const run = async (
    query: string,
    contextValue: Record<string, unknown> = {},
  ): Promise<Response> => {
    const { body } = await server.executeOperation({ query }, { contextValue });
    if (body.kind !== 'single') throw new Error('Expected a single result');
    return body.singleResult as Response;
  };
  return { run, models: restricted.models, stop: () => server.stop() };
}
