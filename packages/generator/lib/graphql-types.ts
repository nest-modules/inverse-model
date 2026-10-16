import type { ColumnKind } from '@nestjs-modules/inverse-introspector';

interface FieldType {
  /** Type returned by the `@Field()` type function. */
  graphql: string;
  ts: string;
}

// json and unknown columns go through as strings until they get their own scalars.
const FIELD_TYPES: Record<ColumnKind, FieldType> = {
  string: { graphql: 'String', ts: 'string' },
  int: { graphql: 'Int', ts: 'number' },
  float: { graphql: 'Float', ts: 'number' },
  boolean: { graphql: 'Boolean', ts: 'boolean' },
  datetime: { graphql: 'Date', ts: 'Date' },
  json: { graphql: 'String', ts: 'string' },
  unknown: { graphql: 'String', ts: 'string' },
};

export const fieldType = (kind: ColumnKind) => FIELD_TYPES[kind];

/** Scalars that must be imported from `@nestjs/graphql`; the rest are globals. */
export const NEST_SCALARS = ['Int', 'Float'];
