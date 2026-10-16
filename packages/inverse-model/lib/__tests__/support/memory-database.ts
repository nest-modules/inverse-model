import type {
  DatabaseConnection,
  DatabaseRecord,
  FieldDefinition,
  FieldFilter,
  ModelDefinition,
  Where,
} from '../../adapters/database-adapter.interface';
import { addRelations } from '../../adapters/relations';

export const field = (
  property: string,
  type: FieldDefinition['type'],
  extra: Partial<FieldDefinition> = {},
): FieldDefinition => ({
  name: property,
  property,
  type,
  isArray: false,
  isNullable: false,
  hasDefault: false,
  ...extra,
});

/** `authors` and `blog_posts`, with database names in snake_case like a real table. */
export function blogModels(): ModelDefinition[] {
  const authors: ModelDefinition = {
    name: 'Authors',
    source: 'authors',
    fields: [
      field('id', 'Int', { hasDefault: true }),
      field('fullName', 'String', { name: 'full_name' }),
    ],
    primaryKey: ['id'],
    relations: [],
  };
  const posts: ModelDefinition = {
    name: 'BlogPosts',
    source: 'blog_posts',
    fields: [
      field('id', 'Int', { hasDefault: true }),
      field('authorId', 'Int', { name: 'author_id' }),
      field('title', 'String'),
    ],
    primaryKey: ['id'],
    relations: [],
  };
  const audit: ModelDefinition = {
    name: 'AuditLog',
    source: 'audit_log',
    fields: [
      field('id', 'Int', { hasDefault: true }),
      field('message', 'String'),
    ],
    primaryKey: ['id'],
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
  return [authors, posts, audit];
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
    return (
      (filter.eq == null || record[key] === filter.eq) &&
      (filter.in == null || filter.in.includes(record[key]))
    );
  });

/**
 * An in-memory database with transactions: a transaction works on a copy of
 * the tables that replaces them on commit. `log` records every call.
 */
export function memoryDatabase(
  models: ModelDefinition[],
  options: { transactions?: boolean } = {},
) {
  let tables = new Map<string, DatabaseRecord[]>(
    models.map((model) => [model.source, []]),
  );
  let nextId = 1;
  const log: string[] = [];

  function over(
    rows: () => Map<string, DatabaseRecord[]>,
    inTransaction: boolean,
  ): DatabaseConnection {
    const table = (model: ModelDefinition) =>
      rows().get(model.source) as DatabaseRecord[];
    const byKey = (model: ModelDefinition, key: DatabaseRecord) =>
      table(model).find((row) =>
        model.primaryKey.every((property) => row[property] === key[property]),
      ) ?? null;
    const copy = (record: DatabaseRecord | null) => record && { ...record };

    const connection: DatabaseConnection = {
      models,
      find: async (model, { where, limit }) => {
        log.push(`find ${model.source}`);
        return table(model)
          .filter((row) => matches(row, where))
          .slice(0, limit ?? undefined)
          .map((row) => ({ ...row }));
      },
      count: async (model, where) =>
        table(model).filter((row) => matches(row, where)).length,
      findOne: async (model, key) => {
        log.push(`findOne ${model.source}`);
        return copy(byKey(model, key));
      },
      insert: async (model, input) => {
        log.push(`insert ${model.source}`);
        const record = { id: nextId++, ...input };
        table(model).push(record);
        return { ...record };
      },
      update: async (model, key, input) => {
        log.push(`update ${model.source}`);
        const record = byKey(model, key);
        if (record) Object.assign(record, input);
        return copy(record);
      },
      delete: async (model, key) => {
        log.push(`delete ${model.source}`);
        const record = byKey(model, key);
        if (record) table(model).splice(table(model).indexOf(record), 1);
        return record;
      },
      upsert: async (model, input) => {
        log.push(`upsert ${model.source}`);
        const record = byKey(model, input);
        if (record) return { ...Object.assign(record, input) };
        const created = { id: nextId++, ...input };
        table(model).push(created);
        return { ...created };
      },
      insertMany: async (model, inputs) => {
        log.push(`insertMany ${model.source}`);
        for (const input of inputs)
          table(model).push({ id: nextId++, ...input });
        return inputs.length;
      },
      deleteMany: async (model, where) => {
        log.push(`deleteMany ${model.source}`);
        const doomed = table(model).filter((row) => matches(row, where));
        for (const row of doomed)
          table(model).splice(table(model).indexOf(row), 1);
        return doomed.length;
      },
      nullsFirst: true,
      close: async () => {},
    };
    if (options.transactions !== false) {
      connection.transaction = async (work) => {
        if (inTransaction) return work({ connection, active: true });
        log.push('begin');
        const working = new Map(
          [...tables].map(([name, rows]) => [
            name,
            rows.map((row) => ({ ...row })),
          ]),
        );
        try {
          const result = await work({
            connection: over(() => working, true),
            active: true,
          });
          tables = working;
          log.push('commit');
          return result;
        } catch (error) {
          log.push('rollback');
          throw error;
        }
      };
    }
    return connection;
  }

  return {
    connection: over(() => tables, false),
    log,
    rows: (source: string) => tables.get(source) as DatabaseRecord[],
  };
}
