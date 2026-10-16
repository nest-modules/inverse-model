import type {
  DatabaseConnection,
  DatabaseRecord,
  FindArgs,
  ModelDefinition,
  RelationDefinition,
  Where,
} from '../adapters/database-adapter.interface';
import { mapWhere } from '../adapters/relation-where';
import { addRelations, type ForeignKey } from '../adapters/relations';

export interface InverseRenameOptions {
  /** GraphQL type name per table or collection, e.g. `{ blog_posts: 'Article' }`. */
  tables?: Record<string, string>;
  /** GraphQL field name per `table.column`, e.g. `{ 'authors.full_name': 'name' }`. */
  fields?: Record<string, string>;
}

const GRAPHQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;

/** Property renames of one model, both ways. */
interface PropertyMap {
  original: ModelDefinition;
  toApi: Map<string, string>;
  toOriginal: Map<string, string>;
  /** Relation properties of the copy → those of the original, for relation filters. */
  relations: Map<string, string>;
}

function checkName(name: string, what: string) {
  if (!GRAPHQL_NAME.test(name)) {
    throw new Error(
      `rename: ${JSON.stringify(name)} for ${what} is not a valid GraphQL name`,
    );
  }
}

/** Copies of the models with the renames applied and their relations named again. */
function renamedModels(
  models: readonly ModelDefinition[],
  rename: InverseRenameOptions,
) {
  const bySource = new Map(models.map((model) => [model.source, model]));
  for (const table of Object.keys(rename.tables ?? {})) {
    if (!bySource.has(table)) throw new Error(`rename: no table ${table}`);
  }
  const fieldRenames = new Map<ModelDefinition, Map<string, string>>();
  for (const [path, property] of Object.entries(rename.fields ?? {})) {
    const dot = path.lastIndexOf('.');
    const model = bySource.get(path.slice(0, dot));
    const field = model?.fields.find(
      (candidate) => candidate.name === path.slice(dot + 1),
    );
    if (!model || !field || dot < 0) {
      throw new Error(`rename: no column ${path}; use table.column`);
    }
    checkName(property, path);
    const renames = fieldRenames.get(model) ?? new Map<string, string>();
    renames.set(field.property, property);
    fieldRenames.set(model, renames);
  }

  const maps = new Map<ModelDefinition, PropertyMap>();
  const copies = new Map<ModelDefinition, ModelDefinition>();
  for (const model of models) {
    const name = rename.tables?.[model.source] ?? model.name;
    checkName(name, model.source);
    const renames = fieldRenames.get(model) ?? new Map<string, string>();
    const toApi = (property: string) => renames.get(property) ?? property;
    const copy: ModelDefinition = {
      ...model,
      name,
      fields: model.fields.map((field) => ({
        ...field,
        property: toApi(field.property),
      })),
      primaryKey: model.primaryKey.map(toApi),
      relations: [],
    };
    const properties = copy.fields.map((field) => field.property);
    const repeated = properties.find((p, i) => properties.indexOf(p) !== i);
    if (repeated)
      throw new Error(`rename: ${name} has two fields named ${repeated}`);
    copies.set(model, copy);
    maps.set(copy, {
      original: model,
      toApi: renames,
      toOriginal: new Map([...renames].map(([from, to]) => [to, from])),
      relations: new Map(),
    });
  }
  const names = [...copies.values()].map((copy) => copy.name);
  const taken = names.find((n, i) => names.indexOf(n) !== i);
  if (taken) throw new Error(`rename: two tables would be named ${taken}`);

  // Every `one` relation, and every `many` one held in an array, is a
  // foreign key; adding them again names both ends after the renames.
  const byName = new Map(models.map((model) => [model.name, model]));
  const apiOf = (of: ModelDefinition, property: string) =>
    fieldRenames.get(of)?.get(property) ?? property;
  const holdsKey = (model: ModelDefinition, relation: RelationDefinition) =>
    relation.kind === 'one' ||
    model.fields.some(
      (field) => field.property === relation.fields[0] && field.isArray,
    );
  const foreignKeys: ForeignKey[] = models.flatMap((model) =>
    model.relations
      .filter((relation) => holdsKey(model, relation))
      .map((relation) => {
        const target = byName.get(relation.target) as ModelDefinition;
        return {
          source: copies.get(model) as ModelDefinition,
          fields: relation.fields.map((field) => apiOf(model, field)),
          target: copies.get(target) as ModelDefinition,
          references: relation.references.map((reference) =>
            apiOf(target, reference),
          ),
        };
      }),
  );
  addRelations(foreignKeys);

  // Each new relation is the original one with the same kind, target and fields.
  const originalOf = new Map(
    [...copies].map(([original, copy]) => [copy.name, original]),
  );
  for (const [model, copy] of copies) {
    const relations = (maps.get(copy) as PropertyMap).relations;
    for (const relation of copy.relations) {
      const target = originalOf.get(relation.target) as ModelDefinition;
      const found = model.relations.find(
        (candidate) =>
          candidate.kind === relation.kind &&
          candidate.target === target.name &&
          candidate.fields.map((field) => apiOf(model, field)).join() ===
            relation.fields.join(),
      );
      if (found) relations.set(relation.property, found.property);
    }
  }
  return { models: [...copies.values()], maps };
}

const renameKeys = (
  record: DatabaseRecord,
  names: ReadonlyMap<string, string>,
): DatabaseRecord =>
  names.size === 0
    ? record
    : Object.fromEntries(
        Object.entries(record).map(([key, value]) => [
          names.get(key) ?? key,
          value,
        ]),
      );

function renamedConnection(
  connection: DatabaseConnection,
  models: ModelDefinition[],
  maps: ReadonlyMap<ModelDefinition, PropertyMap>,
): DatabaseConnection {
  // A model that is not one of the copies goes through as it is.
  const mapOf = (model: ModelDefinition): PropertyMap =>
    maps.get(model) ?? {
      original: model,
      toApi: new Map(),
      toOriginal: new Map(),
      relations: new Map(),
    };
  const out = (model: ModelDefinition, record: DatabaseRecord | null) =>
    record && renameKeys(record, mapOf(model).toApi);
  const into = (model: ModelDefinition, record: DatabaseRecord) =>
    renameKeys(record, mapOf(model).toOriginal);
  const original = (model: ModelDefinition) => mapOf(model).original;
  /** The filter in the original properties, relation filters included. */
  const renameWhere = (
    model: ModelDefinition,
    where: Where | null | undefined,
  ) =>
    mapWhere(where, model, models, {
      field: (of, property) => mapOf(of).toOriginal.get(property) ?? property,
      relation: (of, relation) =>
        mapOf(of).relations.get(relation.property) ?? relation.property,
    });

  const renamed: DatabaseConnection = {
    models,
    async find(model, args) {
      const names = mapOf(model).toOriginal;
      const findArgs: FindArgs = {
        ...args,
        where: await renameWhere(model, args.where),
        orderBy: args.orderBy?.map((entry) => renameKeys(entry, names)) as
          | FindArgs['orderBy']
          | undefined,
      };
      const records = await connection.find(original(model), findArgs);
      return records.map((record) => out(model, record) as DatabaseRecord);
    },
    nullsFirst: connection.nullsFirst,
    count: async (model, where) =>
      connection.count(original(model), await renameWhere(model, where)),
    findOne: async (model, key) =>
      out(model, await connection.findOne(original(model), into(model, key))),
    insert: async (model, input) =>
      out(
        model,
        await connection.insert(original(model), into(model, input)),
      ) as DatabaseRecord,
    update: async (model, key, input) =>
      out(
        model,
        await connection.update(
          original(model),
          into(model, key),
          into(model, input),
        ),
      ),
    delete: async (model, key) =>
      out(model, await connection.delete(original(model), into(model, key))),
    upsert: async (model, input) =>
      out(
        model,
        await connection.upsert(original(model), into(model, input)),
      ) as DatabaseRecord,
    insertMany: (model, inputs) =>
      connection.insertMany(
        original(model),
        inputs.map((input) => into(model, input)),
      ),
    deleteMany: async (model, where) =>
      connection.deleteMany(original(model), await renameWhere(model, where)),
    close: () => connection.close(),
  };
  if (connection.transaction) {
    const begin = connection.transaction.bind(connection);
    renamed.transaction = (work) =>
      begin((transaction) =>
        work({
          ...transaction,
          connection: renamedConnection(transaction.connection, models, maps),
        }),
      );
  }
  return renamed;
}

/**
 * The connection with tables and fields renamed in the API. The models it
 * exposes are renamed copies, with relations named after the new names;
 * records, filters and keys are translated back for the adapter, which keeps
 * reading and writing the original models.
 */
export function withRenames(
  connection: DatabaseConnection,
  rename: InverseRenameOptions,
): DatabaseConnection {
  const { models, maps } = renamedModels(connection.models, rename);
  return renamedConnection(connection, models, maps);
}
