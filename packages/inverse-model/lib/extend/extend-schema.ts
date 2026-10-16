import type { ApolloDriverConfig } from '@nestjs/apollo';
import { type DocumentNode, print } from 'graphql';
import type {
  DatabaseConnection,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import type { Writes } from '../hooks/writes';

type Resolvers = NonNullable<ApolloDriverConfig['resolvers']>;
/** One resolver map, e.g. `{ Query: { … }, Authors: { … } }`. */
type ResolverMap = Exclude<Resolvers, unknown[]>;

/** What resolvers given as a function get to work with. */
export interface InverseApi {
  /** The connection the generated API reads and writes through; `transaction` runs work in one. */
  connection: DatabaseConnection;
  /** The model of a table or collection, by table name (`blog_posts`) or GraphQL type name. */
  model(name: string): ModelDefinition;
  /** Creates, updates and deletes like the generated mutations do, with their hooks. */
  writes: Writes;
}

export interface InverseExtendOptions {
  /**
   * SDL merged into the generated schema. It may extend generated types
   * (`extend type Authors { displayName: String! }`), add queries and
   * mutations (`extend type Query { … }`) and use the generated types and inputs.
   */
  typeDefs?: string | DocumentNode | (string | DocumentNode)[];
  /** Resolvers for those fields, or a function that builds them from the API. */
  resolvers?: Resolvers | ((api: InverseApi) => Resolvers);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  Object.getPrototypeOf(value) === Object.prototype;

/**
 * Merges resolver maps type by type, so later maps add fields to the types of
 * earlier ones and replace only the fields they both define. Anything else,
 * such as a scalar, is replaced whole.
 */
export function mergeResolvers(
  ...maps: (Resolvers | undefined)[]
): ResolverMap {
  const merged: Record<string, unknown> = {};
  for (const map of maps.flat()) {
    for (const [type, value] of Object.entries(map ?? {})) {
      const current = merged[type];
      merged[type] =
        isPlainObject(current) && isPlainObject(value)
          ? { ...current, ...value }
          : value;
    }
  }
  return merged as ResolverMap;
}

/** The generated SDL and resolvers with the app's own merged in. */
export function extendSchema(
  schema: { typeDefs: string; resolvers: Resolvers | undefined },
  extend: InverseExtendOptions | undefined,
  api: InverseApi,
): { typeDefs: string; resolvers: ResolverMap } {
  const extra = extend?.typeDefs === undefined ? [] : [extend.typeDefs].flat();
  const resolvers =
    typeof extend?.resolvers === 'function'
      ? extend.resolvers(api)
      : extend?.resolvers;
  return {
    typeDefs: [
      schema.typeDefs,
      ...extra.map((typeDefs) =>
        typeof typeDefs === 'string' ? typeDefs : print(typeDefs),
      ),
    ].join('\n\n'),
    resolvers: mergeResolvers(schema.resolvers, resolvers),
  };
}

/** `model(name)` of the API: by table name first, then by GraphQL type name. */
export function modelLookup(connection: DatabaseConnection) {
  return (name: string) => {
    const model =
      connection.models.find((candidate) => candidate.source === name) ??
      connection.models.find((candidate) => candidate.name === name);
    if (!model) throw new Error(`No table or collection named ${name}`);
    return model;
  };
}

/**
 * Apollo options that serve the schema. The resolvers go in through
 * `transformResolvers` so they merge type by type with those of Nest resolver
 * classes (`@Resolver('Authors')`, `@Query()`), which win where both define a
 * field. Through `resolvers`, Nest would replace whole types.
 */
export function schemaOptions(
  schema: { typeDefs: string; resolvers: ResolverMap },
  transformResolvers: ApolloDriverConfig['transformResolvers'],
): Pick<ApolloDriverConfig, 'typeDefs' | 'transformResolvers'> {
  return {
    typeDefs: schema.typeDefs,
    transformResolvers: (discovered) => {
      const merged = mergeResolvers(schema.resolvers, discovered);
      return transformResolvers ? transformResolvers(merged) : merged;
    },
  };
}
