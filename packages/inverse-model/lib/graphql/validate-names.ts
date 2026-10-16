import type { ModelDefinition } from '../adapters/database-adapter.interface';
import { operationNames } from './operation-names';
import { SHARED_TYPE_DEFS, sortableFields, updatableFields } from './type-defs';

const GRAPHQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;

/** Types every schema has or this one always defines. */
export const RESERVED_TYPE_NAMES: ReadonlySet<string> = new Set([
  'Query',
  'Mutation',
  'Subscription',
  'Int',
  'Float',
  'String',
  'Boolean',
  'ID',
  'PageInfo',
  ...[
    ...SHARED_TYPE_DEFS.matchAll(
      /^(?:scalar|enum|input|type|interface|union)\s+(\w+)/gm,
    ),
  ].map((match) => match[1]),
]);

const RESERVED_QUERY_FIELDS: ReadonlySet<string> = new Set(['health']);

// Every Where input already has these; a field of the same name would clash.
const RESERVED_FIELDS: ReadonlySet<string> = new Set(['AND', 'OR', 'NOT']);

const isValidName = (name: string) =>
  GRAPHQL_NAME.test(name) && !name.startsWith('__');

interface Claim {
  name: string;
  /** What the name is for, e.g. `type` or `filter input`. */
  role: string;
  model: ModelDefinition;
}

/** Names of the schema a model generates, by where they live. */
function claimsOf(model: ModelDefinition) {
  const { name } = model;
  const names = operationNames(model);
  const hasKey = model.primaryKey.length > 0;
  const claim = (claimName: string, role: string): Claim => ({
    name: claimName,
    role,
    model,
  });

  const types = [
    claim(name, 'type'),
    claim(`${name}Where`, 'filter input'),
    claim(`Create${name}Input`, 'create input'),
    claim(`${name}ManyWhere`, 'relation filter input'),
  ];
  if (hasKey) {
    types.push(claim(`${name}Connection`, 'connection type'));
    types.push(claim(`${name}Edge`, 'edge type'));
  }
  if (sortableFields(model).length > 0) {
    types.push(claim(`${name}OrderBy`, 'order input'));
  }
  const updatable = hasKey && updatableFields(model).length > 0;
  if (updatable) types.push(claim(`Update${name}Input`, 'update input'));

  const query = [claim(names.list, 'list'), claim(names.count, 'count')];
  if (hasKey) {
    query.push(claim(names.byPk, 'by-key query'));
    query.push(claim(names.connection, 'connection'));
  }

  const mutation = [
    claim(names.create, 'create mutation'),
    claim(names.createMany, 'batch create mutation'),
  ];
  if (updatable) mutation.push(claim(names.update, 'update mutation'));
  if (hasKey) {
    mutation.push(claim(names.delete, 'delete mutation'));
    mutation.push(claim(names.upsert, 'upsert mutation'));
    mutation.push(claim(names.deleteMany, 'batch delete mutation'));
  }

  return { types, query, mutation };
}

const owner = (claim: Claim) => `${claim.model.source} (${claim.role})`;

function duplicates(what: string, claims: Claim[]): string[] {
  const byName = new Map<string, Claim[]>();
  for (const claim of claims) {
    byName.set(claim.name, [...(byName.get(claim.name) ?? []), claim]);
  }
  return [...byName]
    .filter(([, owners]) => owners.length > 1)
    .map(
      ([name, owners]) =>
        `${what} ${name} comes from more than one table: ${owners.map(owner).join(', ')}.`,
    );
}

function fieldProblems(model: ModelDefinition): string[] {
  const problems: string[] = [];
  const properties = [
    ...model.fields.map((field) => ({
      property: field.property,
      from: `column ${field.name}`,
    })),
    ...model.relations.map((relation) => ({
      property: relation.property,
      from: `relation to ${relation.target}`,
    })),
  ];
  const seen = new Map<string, string>();
  for (const { property, from } of properties) {
    if (!isValidName(property)) {
      problems.push(
        `Table ${model.source}: ${from} becomes the field "${property}", which is not a valid GraphQL name.`,
      );
    } else if (RESERVED_FIELDS.has(property)) {
      problems.push(
        `Table ${model.source}: ${from} becomes the field ${property}, which is reserved for filters.`,
      );
    }
    const earlier = seen.get(property);
    if (earlier) {
      problems.push(
        `Table ${model.source}: ${earlier} and ${from} both become the field ${property}.`,
      );
    }
    seen.set(property, from);
  }
  return problems;
}

function modelProblems(model: ModelDefinition): string[] {
  const { types, query, mutation } = claimsOf(model);
  const problems: string[] = [];
  const invalid = [...types, ...query, ...mutation].find(
    (claim) => !isValidName(claim.name),
  );
  if (invalid) {
    problems.push(
      `Table ${model.source} becomes the ${invalid.role} "${invalid.name}", which is not a valid GraphQL name.`,
    );
  }
  for (const claim of types) {
    if (RESERVED_TYPE_NAMES.has(claim.name)) {
      problems.push(
        `Table ${model.source} becomes the ${claim.role} ${claim.name}, a name the API already uses.`,
      );
    }
  }
  for (const claim of query) {
    if (RESERVED_QUERY_FIELDS.has(claim.name)) {
      problems.push(
        `Table ${model.source} becomes the ${claim.role} ${claim.name}, a query the API already has.`,
      );
    }
  }
  return [...problems, ...fieldProblems(model)];
}

/**
 * Everything wrong with the GraphQL names of the models: names two tables
 * share, names the schema already uses and names GraphQL does not allow.
 * Empty when the schema can be built.
 */
export function namingProblems(models: readonly ModelDefinition[]): string[] {
  const claims = models.map(claimsOf);
  return [
    ...models.flatMap(modelProblems),
    ...duplicates(
      'The type',
      claims.flatMap((claim) => claim.types),
    ),
    ...duplicates(
      'The query',
      claims.flatMap((claim) => claim.query),
    ),
    ...duplicates(
      'The mutation',
      claims.flatMap((claim) => claim.mutation),
    ),
  ];
}

/** Throws an error listing every naming problem of the models, if there is any. */
export function assertValidNames(models: readonly ModelDefinition[]): void {
  const problems = namingProblems(models);
  if (problems.length === 0) return;
  throw new Error(
    [
      'The tables of this database cannot be named in GraphQL:',
      ...problems.map((problem) => `  - ${problem}`),
      'Pick other names with the `naming` option of InverseModelModule, e.g.',
      "  naming: { type: (table) => table === 'audit.users' ? 'AuditUser' : defaultNaming.type(table) }",
    ].join('\n'),
  );
}
