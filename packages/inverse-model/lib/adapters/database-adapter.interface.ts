/** GraphQL type a field is exposed as. */
export type FieldType =
  | 'ID'
  | 'Int'
  | 'Float'
  | 'Boolean'
  | 'String'
  | 'DateTime'
  | 'JSON';

export interface FieldDefinition {
  /** Column or field name in the database, e.g. `created_at`. */
  name: string;
  /** Property name in the GraphQL API, e.g. `createdAt`. */
  property: string;
  type: FieldType;
  isArray: boolean;
  isNullable: boolean;
  /** Filled in by the database on insert, so it may be left out on create. */
  hasDefault: boolean;
}

/** A table or collection of the database. */
export interface ModelDefinition {
  /** GraphQL type name, e.g. `BlogPosts`. */
  name: string;
  fields: FieldDefinition[];
}

/** An open connection to one database, with the models read from it. */
export interface DatabaseConnection {
  readonly models: ModelDefinition[];
  /** Inserts `input` (keyed by property) and returns the created record, keyed by property. */
  insert(
    model: ModelDefinition,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

/** Knows how to read and write one kind of database. */
export interface DatabaseAdapter {
  /** Shown in errors, e.g. `postgres`. */
  readonly name: string;
  /** URL protocols this adapter handles, without the colon, e.g. `postgresql`. */
  readonly protocols: readonly string[];
  connect(url: string): Promise<DatabaseConnection>;
}
