import type {
  FieldDefinition,
  FieldType,
  ModelDefinition,
  RelationDefinition,
} from '../adapters/database-adapter.interface';
import { operationNames } from './operation-names';

const SHARED_TYPE_DEFS = `scalar DateTime
scalar JSON

enum SortDirection {
  ASC
  DESC
}

input IDFilter {
  eq: ID
  ne: ID
  in: [ID!]
  isNull: Boolean
}

input StringFilter {
  eq: String
  ne: String
  in: [String!]
  "Case-insensitive substring match."
  contains: String
  isNull: Boolean
}

input IntFilter {
  eq: Int
  ne: Int
  gt: Int
  gte: Int
  lt: Int
  lte: Int
  in: [Int!]
  isNull: Boolean
}

input FloatFilter {
  eq: Float
  ne: Float
  gt: Float
  gte: Float
  lt: Float
  lte: Float
  in: [Float!]
  isNull: Boolean
}

input DateTimeFilter {
  eq: DateTime
  ne: DateTime
  gt: DateTime
  gte: DateTime
  lt: DateTime
  lte: DateTime
  isNull: Boolean
}

input BooleanFilter {
  eq: Boolean
  ne: Boolean
  isNull: Boolean
}

"Arrays and JSON values can only be checked for null."
input NullFilter {
  isNull: Boolean
}`;

const isComparable = (field: FieldDefinition) =>
  !field.isArray && field.type !== 'JSON';

const filterOf = (field: FieldDefinition) =>
  isComparable(field) ? `${field.type}Filter` : 'NullFilter';

function graphqlType(type: FieldType, isArray: boolean, required: boolean) {
  const list = isArray ? `[${type}]` : type;
  return required ? `${list}!` : list;
}

const fieldType = (field: FieldDefinition, required: boolean) =>
  graphqlType(field.type, field.isArray, required);

const block = (keyword: string, name: string, lines: string[]) =>
  `${keyword} ${name} {\n${lines.map((line) => `  ${line}`).join('\n')}\n}`;

/** Fields of a model that `orderBy` can sort by; none means no `orderBy` argument. */
export const sortableFields = (model: ModelDefinition) =>
  model.fields.filter(isComparable);

/** Fields `update` may change: all but the primary key. */
export const updatableFields = (model: ModelDefinition) =>
  model.fields.filter((field) => !model.primaryKey.includes(field.property));

/** Arguments of a list field: filter, order and page. */
function listArguments(model: ModelDefinition): string {
  const orderBy =
    sortableFields(model).length > 0
      ? `, orderBy: [${model.name}OrderBy!]`
      : '';
  return `(where: ${model.name}Where${orderBy}, limit: Int, offset: Int)`;
}

/** `id: Int!` for each primary key field. */
export function keyArguments(model: ModelDefinition): string {
  return model.primaryKey
    .map((property) => {
      const field = model.fields.find(
        (candidate) => candidate.property === property,
      ) as FieldDefinition;
      return `${property}: ${fieldType(field, true)}`;
    })
    .join(', ');
}

function relationField(
  relation: RelationDefinition,
  models: Map<string, ModelDefinition>,
): string {
  const target = models.get(relation.target) as ModelDefinition;
  return relation.kind === 'one'
    ? `${relation.property}: ${target.name}`
    : `${relation.property}${listArguments(target)}: [${target.name}!]!`;
}

function modelTypeDefs(
  model: ModelDefinition,
  models: Map<string, ModelDefinition>,
): string[] {
  const { name } = model;
  const typeDefs = [
    block('type', name, [
      ...model.fields.map(
        (field) => `${field.property}: ${fieldType(field, !field.isNullable)}`,
      ),
      ...model.relations.map((relation) => relationField(relation, models)),
    ]),
    block('input', `${name}Where`, [
      `AND: [${name}Where!]`,
      `OR: [${name}Where!]`,
      `NOT: ${name}Where`,
      ...model.fields.map((field) => `${field.property}: ${filterOf(field)}`),
    ]),
    block(
      'input',
      `Create${name}Input`,
      model.fields.map(
        (field) =>
          `${field.property}: ${fieldType(field, !field.isNullable && !field.hasDefault)}`,
      ),
    ),
  ];

  const sortable = sortableFields(model);
  if (sortable.length > 0) {
    typeDefs.push(
      block(
        'input',
        `${name}OrderBy`,
        sortable.map((field) => `${field.property}: SortDirection`),
      ),
    );
  }

  const updatable = updatableFields(model);
  if (model.primaryKey.length > 0 && updatable.length > 0) {
    typeDefs.push(
      block(
        'input',
        `Update${name}Input`,
        updatable.map(
          (field) => `${field.property}: ${fieldType(field, false)}`,
        ),
      ),
    );
  }
  return typeDefs;
}

function queryFields(model: ModelDefinition): string[] {
  const names = operationNames(model);
  const fields = [
    `${names.list}${listArguments(model)}: [${model.name}!]!`,
    `${names.count}(where: ${model.name}Where): Int!`,
  ];
  if (model.primaryKey.length > 0) {
    fields.push(`${names.byPk}(${keyArguments(model)}): ${model.name}`);
  }
  return fields;
}

function mutationFields(model: ModelDefinition): string[] {
  if (model.readOnly) return [];
  const names = operationNames(model);
  const fields = [
    `${names.create}(input: Create${model.name}Input!): ${model.name}!`,
  ];
  if (model.primaryKey.length > 0) {
    if (updatableFields(model).length > 0) {
      fields.push(
        `${names.update}(${keyArguments(model)}, input: Update${model.name}Input!): ${model.name}`,
      );
    }
    fields.push(`${names.delete}(${keyArguments(model)}): ${model.name}`);
  }
  return fields;
}

/** SDL of the whole API: per model, a type, its inputs, its queries and its mutations. */
export function createTypeDefs(models: readonly ModelDefinition[]): string {
  const byName = new Map(models.map((model) => [model.name, model]));
  const mutations = models.flatMap(mutationFields);
  return [
    SHARED_TYPE_DEFS,
    // GraphQL requires a Query root type even for a database with no tables.
    block('type', 'Query', ['health: String!', ...models.flatMap(queryFields)]),
    ...(mutations.length > 0 ? [block('type', 'Mutation', mutations)] : []),
    ...models.flatMap((model) => modelTypeDefs(model, byName)),
  ].join('\n\n');
}
