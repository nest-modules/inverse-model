import { pluralize } from '../../utils/inflection';
import { defaultNaming, type Naming } from '../../utils/naming';
import type {
  FieldDefinition,
  FieldType,
  ModelDefinition,
} from '../database-adapter.interface';
import type { ForeignKey } from '../relations';

const ID_FIELD: FieldDefinition = {
  name: '_id',
  property: 'id',
  type: 'ID',
  isArray: false,
  isNullable: false,
  hasDefault: true,
};

// BSON values are told apart by `_bsontype` so this file does not load the driver.
const bsonTypeOf = (value: unknown) =>
  (value as { _bsontype?: string } | null)?._bsontype;

/** ObjectIds and DBRefs both point at a document. */
const isReference = (value: unknown) =>
  bsonTypeOf(value) === 'ObjectId' || bsonTypeOf(value) === 'DBRef';

/** An array of references is an `ID[]`; any other array is JSON. */
type InferredType = FieldType | 'ID[]';

function typeOf(value: unknown): InferredType {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(isReference) ? 'ID[]' : 'JSON';
  }
  return scalarTypeOf(value);
}

function scalarTypeOf(value: unknown): FieldType {
  switch (typeof value) {
    case 'string':
      return 'String';
    case 'boolean':
      return 'Boolean';
    case 'number':
      return Number.isInteger(value) ? 'Int' : 'Float';
  }
  if (value instanceof Date) return 'DateTime';
  const bsonType = bsonTypeOf(value);
  if (bsonType === 'ObjectId' || bsonType === 'DBRef') return 'ID';
  // Decimal128, Long and the other BSON types keep their precision as strings.
  if (bsonType) return 'String';
  return 'JSON';
}

function mergeTypes(
  types: Set<InferredType>,
): Pick<FieldDefinition, 'type' | 'isArray'> {
  if (types.size === 1) {
    const [type] = types;
    return type === 'ID[]'
      ? { type: 'ID', isArray: true }
      : { type, isArray: false };
  }
  if (types.size === 2 && types.has('Int') && types.has('Float')) {
    return { type: 'Float', isArray: false };
  }
  return { type: 'JSON', isArray: false };
}

/**
 * Model of a collection from a sample of its documents. A collection has no
 * schema, so every field but `_id` is nullable and optional on create, and a
 * field whose values disagree on their type is JSON.
 */
export function inferModel(
  collection: string,
  documents: readonly Record<string, unknown>[],
  naming: Naming = defaultNaming,
): ModelDefinition {
  const typesByField = new Map<string, Set<InferredType>>();
  for (const document of documents) {
    for (const [name, value] of Object.entries(document)) {
      if (name === '_id' || value === null || value === undefined) continue;
      const types = typesByField.get(name) ?? new Set<InferredType>();
      // An empty array tells nothing about its elements.
      if (!Array.isArray(value) || value.length > 0) types.add(typeOf(value));
      typesByField.set(name, types);
    }
  }

  const fields = [...typesByField].map(
    ([name, types]): FieldDefinition => ({
      name,
      property: naming.field(name, collection),
      ...(types.size > 0
        ? mergeTypes(types)
        : { type: 'JSON', isArray: false }),
      isNullable: true,
      hasDefault: false,
    }),
  );

  const name = naming.type(collection);
  return {
    name,
    plural: naming.plural(name),
    source: collection,
    fields: [ID_FIELD, ...fields],
    primaryKey: ['id'],
    relations: [],
  };
}

/**
 * Collection each DBRef field points at, by field name: DBRefs, alone or in
 * arrays, name their collection. A field whose DBRefs disagree is left out.
 */
export function inferDbRefs(
  documents: readonly Record<string, unknown>[],
): Map<string, string> {
  const collections = new Map<string, Set<string>>();
  for (const document of documents) {
    for (const [name, value] of Object.entries(document)) {
      for (const element of Array.isArray(value) ? value : [value]) {
        if (bsonTypeOf(element) !== 'DBRef') continue;
        const found = collections.get(name) ?? new Set<string>();
        found.add((element as { collection: string }).collection);
        collections.set(name, found);
      }
    }
  }
  return new Map(
    [...collections]
      .filter(([, found]) => found.size === 1)
      .map(([name, found]) => [name, [...found][0]]),
  );
}

const normalize = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * MongoDB has no foreign keys, so they are read from DBRefs, which name
 * their collection, or guessed from names: an ID field `author_id` or
 * `authorId` references the collection `author`, `authors` or `authores`
 * (`category_id` the collection `categories`), and an array of ids
 * `tag_ids` or `tagIds` the collection `tags`, when one exists. `dbRefs`
 * holds the DBRef fields of each collection, by source.
 */
export function inferForeignKeys(
  models: readonly ModelDefinition[],
  dbRefs: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map(),
): ForeignKey[] {
  const byName = (base: string) => {
    const candidates = [base, `${base}s`, `${base}es`, pluralize(base)].map(
      normalize,
    );
    return models.find((model) => candidates.includes(normalize(model.source)));
  };
  return models.flatMap((source) =>
    source.fields.flatMap((field) => {
      if (field.type !== 'ID' || field.name === '_id') return [];
      const collection = dbRefs.get(source.source)?.get(field.name);
      const base = field.name.match(
        field.isArray ? /^(.+?)_?ids$/i : /^(.+?)_?id$/i,
      )?.[1];
      const target = collection
        ? models.find((model) => model.source === collection)
        : base && byName(base);
      return target
        ? [{ source, fields: [field.property], target, references: ['id'] }]
        : [];
    }),
  );
}
