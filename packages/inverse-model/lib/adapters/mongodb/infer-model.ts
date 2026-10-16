import { camelCase, pascalCase } from '../../utils/naming';
import type {
  FieldDefinition,
  FieldType,
  ModelDefinition,
} from '../database-adapter.interface';

const ID_FIELD: FieldDefinition = {
  name: '_id',
  property: 'id',
  type: 'ID',
  isArray: false,
  isNullable: false,
  hasDefault: true,
};

// BSON values are told apart by `_bsontype` so this file does not load the driver.
function typeOf(value: unknown): FieldType {
  switch (typeof value) {
    case 'string':
      return 'String';
    case 'boolean':
      return 'Boolean';
    case 'number':
      return Number.isInteger(value) ? 'Int' : 'Float';
  }
  if (value instanceof Date) return 'DateTime';
  const bsonType = (value as { _bsontype?: string })._bsontype;
  if (bsonType === 'ObjectId') return 'ID';
  // Decimal128, Long and the other BSON types keep their precision as strings.
  if (bsonType) return 'String';
  return 'JSON';
}

function mergeTypes(types: Set<FieldType>): FieldType {
  if (types.size === 1) return [...types][0];
  if (types.size === 2 && types.has('Int') && types.has('Float')) {
    return 'Float';
  }
  return 'JSON';
}

/**
 * Model of a collection from a sample of its documents. A collection has no
 * schema, so every field but `_id` is nullable and optional on create, and a
 * field whose values disagree on their type is JSON.
 */
export function inferModel(
  collection: string,
  documents: readonly Record<string, unknown>[],
): ModelDefinition {
  const typesByField = new Map<string, Set<FieldType>>();
  for (const document of documents) {
    for (const [name, value] of Object.entries(document)) {
      if (name === '_id' || value === null || value === undefined) continue;
      const types = typesByField.get(name) ?? new Set<FieldType>();
      types.add(typeOf(value));
      typesByField.set(name, types);
    }
  }

  const fields = [...typesByField].map(
    ([name, types]): FieldDefinition => ({
      name,
      property: camelCase(name),
      type: mergeTypes(types),
      isArray: false,
      isNullable: true,
      hasDefault: false,
    }),
  );

  return { name: pascalCase(collection), fields: [ID_FIELD, ...fields] };
}
