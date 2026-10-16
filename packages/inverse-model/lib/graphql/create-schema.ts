import type { ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLISODateTime } from '@nestjs/graphql';
import type {
  DatabaseConnection,
  FieldDefinition,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import { GraphQLJSON } from './json.scalar';

export interface GraphQLSchemaParts {
  typeDefs: string;
  resolvers: ApolloDriverConfig['resolvers'];
}

function fieldType(field: FieldDefinition, required: boolean): string {
  const list = field.isArray ? `[${field.type}]` : field.type;
  return required ? `${list}!` : list;
}

// Fields the database fills in may be left out on create.
const isRequiredOnCreate = (field: FieldDefinition) =>
  !field.isNullable && !field.hasDefault;

function modelTypeDefs(model: ModelDefinition): string {
  const fields = model.fields.map(
    (field) => `  ${field.property}: ${fieldType(field, !field.isNullable)}`,
  );
  const inputs = model.fields.map(
    (field) =>
      `  ${field.property}: ${fieldType(field, isRequiredOnCreate(field))}`,
  );
  return `type ${model.name} {
${fields.join('\n')}
}

input Create${model.name}Input {
${inputs.join('\n')}
}`;
}

/** Builds the GraphQL schema of the connection: one `create<Model>` mutation per table or collection. */
export function createSchema(
  connection: DatabaseConnection,
): GraphQLSchemaParts {
  const { models } = connection;
  const mutations = models.map(
    (model) =>
      `  create${model.name}(input: Create${model.name}Input!): ${model.name}!`,
  );

  const typeDefs = [
    'scalar DateTime',
    'scalar JSON',
    // GraphQL requires a Query root type; the entry points of the API are the create mutations.
    'type Query {\n  health: String!\n}',
    ...(models.length > 0
      ? [`type Mutation {\n${mutations.join('\n')}\n}`]
      : []),
    ...models.map(modelTypeDefs),
  ].join('\n\n');

  const createResolvers = models.map((model) => [
    `create${model.name}`,
    (_parent: unknown, { input }: { input: Record<string, unknown> }) =>
      connection.insert(model, input),
  ]);

  return {
    typeDefs,
    resolvers: {
      DateTime: GraphQLISODateTime,
      JSON: GraphQLJSON,
      Query: { health: () => 'ok' },
      ...(models.length > 0
        ? { Mutation: Object.fromEntries(createResolvers) }
        : {}),
    },
  };
}
