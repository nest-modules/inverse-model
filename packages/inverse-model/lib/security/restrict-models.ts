import type {
  DatabaseConnection,
  FieldDefinition,
  ModelDefinition,
} from '../adapters/database-adapter.interface';

export interface ModelRules {
  /** Tables and `table.column`s to expose; everything when not given. */
  include?: readonly string[];
  /** Tables and `table.column`s to hide; wins over `include`. */
  exclude?: readonly string[];
  /** True, or the tables that get no create, update or delete. */
  readOnly?: boolean | readonly string[];
}

const escapeRegex = (value: string) =>
  value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** `*` stands for any run of characters other than a dot. */
const toRegex = (pattern: string) =>
  new RegExp(`^${escapeRegex(pattern).replace(/\*/g, '[^.]*')}$`);

/** A table answers to its full name and, when schema-qualified, to its bare name too. */
const namesOf = (model: ModelDefinition) => {
  const bare = model.source.slice(model.source.lastIndexOf('.') + 1);
  return bare === model.source ? [model.source] : [model.source, bare];
};

/** Tests patterns of `table` and `table.column` against a model and its fields. */
function patternSet(patterns: readonly string[]) {
  const regexes = patterns.map(toRegex);
  const any = (names: string[]) =>
    names.some((name) => regexes.some((regex) => regex.test(name)));
  return {
    table: (model: ModelDefinition) => any(namesOf(model)),
    field: (model: ModelDefinition, field: FieldDefinition) =>
      any(namesOf(model).map((name) => `${name}.${field.name}`)),
    someField: (model: ModelDefinition) =>
      model.fields.some((field) =>
        any(namesOf(model).map((name) => `${name}.${field.name}`)),
      ),
  };
}

/**
 * The models the API may expose: tables and fields left out by `include` or
 * `exclude` are dropped, along with relations through them, and read-only
 * tables are marked. Returns copies; the adapter's models are left as they are.
 */
export function restrictModels(
  models: readonly ModelDefinition[],
  rules: ModelRules,
): ModelDefinition[] {
  const include = rules.include && patternSet(rules.include);
  const exclude = patternSet(rules.exclude ?? []);
  const readOnly = Array.isArray(rules.readOnly)
    ? patternSet(rules.readOnly)
    : undefined;

  const tableShown = (model: ModelDefinition) =>
    !exclude.table(model) &&
    (!include || include.table(model) || include.someField(model));
  const fieldShown = (model: ModelDefinition, field: FieldDefinition) =>
    !exclude.field(model, field) &&
    (!include || include.table(model) || include.field(model, field));

  // A list, not a map by name: duplicate names must reach the name check and fail there.
  const kept = models.filter(tableShown).map((model) => {
    const fields = model.fields.filter((field) => fieldShown(model, field));
    const properties = new Set(fields.map((field) => field.property));
    const copy: ModelDefinition = {
      ...model,
      fields,
      // A key with a hidden column cannot be asked for, so the table is treated as keyless.
      primaryKey: model.primaryKey.every((key) => properties.has(key))
        ? [...model.primaryKey]
        : [],
      relations: [...model.relations],
      readOnly:
        model.readOnly ||
        rules.readOnly === true ||
        (readOnly?.table(model) ?? false),
    };
    return copy;
  });
  const byName = new Map(kept.map((model) => [model.name, model]));

  const hasProperty = (model: ModelDefinition, property: string) =>
    model.fields.some((field) => field.property === property);
  for (const model of kept) {
    model.relations = model.relations.filter((relation) => {
      const target = byName.get(relation.target);
      return (
        target !== undefined &&
        relation.fields.every((field) => hasProperty(model, field)) &&
        relation.references.every((reference) => hasProperty(target, reference))
      );
    });
  }
  return kept;
}

/** The connection with only the allowed models, refusing writes to read-only ones. */
export function restrictConnection(
  connection: DatabaseConnection,
  rules: ModelRules,
): DatabaseConnection {
  const models = restrictModels(connection.models, rules);
  const writable = (model: ModelDefinition) => {
    if (model.readOnly) throw new Error(`${model.name} is read-only`);
    return model;
  };
  return {
    models,
    find: (model, args) => connection.find(model, args),
    count: (model, where) => connection.count(model, where),
    findOne: (model, key) => connection.findOne(model, key),
    insert: async (model, input) => connection.insert(writable(model), input),
    update: async (model, key, input) =>
      connection.update(writable(model), key, input),
    delete: async (model, key) => connection.delete(writable(model), key),
    upsert: async (model, input) => connection.upsert(writable(model), input),
    insertMany: async (model, inputs) =>
      connection.insertMany(writable(model), inputs),
    deleteMany: async (model, where) =>
      connection.deleteMany(writable(model), where),
    nullsFirst: connection.nullsFirst,
    ...(connection.transaction && {
      transaction: (work) =>
        (connection.transaction as NonNullable<typeof connection.transaction>)(
          (transaction) =>
            work({
              ...transaction,
              connection: restrictConnection(transaction.connection, rules),
            }),
        ),
    }),
    close: () => connection.close(),
  };
}
