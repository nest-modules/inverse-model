import type { ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLISODateTime } from '@nestjs/graphql';
import type { DataSource, EntityMetadata } from 'typeorm';
import type { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import { graphqlType } from './graphql-type';
import { GraphQLJSON } from './json.scalar';

export interface GraphQLSchemaParts {
  typeDefs: string;
  resolvers: ApolloDriverConfig['resolvers'];
}

function fieldType(column: ColumnMetadata, required: boolean): string {
  const type = graphqlType(String(column.type));
  const list = column.isArray ? `[${type}]` : type;
  return required ? `${list}!` : list;
}

// Generated columns and columns with a default may be left out on create.
const isRequiredOnCreate = (column: ColumnMetadata) =>
  !column.isNullable && !column.isGenerated && column.default === undefined;

function entityTypeDefs(entity: EntityMetadata): string {
  const fields = entity.columns.map(
    (column) =>
      `  ${column.propertyName}: ${fieldType(column, !column.isNullable)}`,
  );
  const inputs = entity.columns.map(
    (column) =>
      `  ${column.propertyName}: ${fieldType(column, isRequiredOnCreate(column))}`,
  );
  return `type ${entity.name} {
${fields.join('\n')}
}

input Create${entity.name}Input {
${inputs.join('\n')}
}`;
}

/** Builds the GraphQL schema of the data source: one `create<Entity>` mutation per table. */
export function createSchema(dataSource: DataSource): GraphQLSchemaParts {
  const entities = dataSource.entityMetadatas;
  const mutations = entities.map(
    (entity) =>
      `  create${entity.name}(input: Create${entity.name}Input!): ${entity.name}!`,
  );

  const typeDefs = [
    'scalar DateTime',
    'scalar JSON',
    // GraphQL requires a Query root type; the entry points of the API are the create mutations.
    'type Query {\n  health: String!\n}',
    ...(entities.length > 0
      ? [`type Mutation {\n${mutations.join('\n')}\n}`]
      : []),
    ...entities.map(entityTypeDefs),
  ].join('\n\n');

  const createResolvers = entities.map((entity) => [
    `create${entity.name}`,
    async (_parent: unknown, { input }: { input: Record<string, unknown> }) => {
      const result = await dataSource
        .getRepository(entity.target)
        .insert(input);
      return { ...input, ...result.generatedMaps[0] };
    },
  ]);

  return {
    typeDefs,
    resolvers: {
      DateTime: GraphQLISODateTime,
      JSON: GraphQLJSON,
      Query: { health: () => 'ok' },
      ...(entities.length > 0
        ? { Mutation: Object.fromEntries(createResolvers) }
        : {}),
    },
  };
}
