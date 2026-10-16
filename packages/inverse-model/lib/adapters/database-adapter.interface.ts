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

/**
 * Link to another model through a foreign key. `one` points from the model
 * holding the key to the row it references; `many` is the way back.
 */
export interface RelationDefinition {
  /** Property in the GraphQL API, e.g. `author` or `blogPosts`. */
  property: string;
  kind: 'one' | 'many';
  /** Name of the related model. */
  target: string;
  /** Property of this model whose value is looked up. */
  field: string;
  /** Property of the related model that must equal `field`. */
  reference: string;
}

/** A table or collection of the database. */
export interface ModelDefinition {
  /** GraphQL type name, e.g. `BlogPosts`. */
  name: string;
  /** Table or collection name in the database, e.g. `blog_posts`. */
  source: string;
  fields: FieldDefinition[];
  /** Properties of the primary key; empty when the table has none. */
  primaryKey: string[];
  relations: RelationDefinition[];
}

/** Conditions on one field; every condition given must hold. */
export interface FieldFilter {
  eq?: unknown;
  ne?: unknown;
  gt?: unknown;
  gte?: unknown;
  lt?: unknown;
  lte?: unknown;
  in?: unknown[];
  /** Case-insensitive substring match. */
  contains?: string;
  isNull?: boolean;
}

/** Filter keyed by property, combined with AND, OR and NOT. */
export type Where = {
  AND?: Where[] | null;
  OR?: Where[] | null;
  NOT?: Where | null;
} & { [property: string]: FieldFilter | Where | Where[] | null | undefined };

export type SortDirection = 'ASC' | 'DESC';

export interface FindArgs {
  where?: Where | null;
  /** Each entry sorts by one property; earlier entries take precedence. */
  orderBy?: Record<string, SortDirection>[] | null;
  limit?: number | null;
  offset?: number | null;
}

export type DatabaseRecord = Record<string, unknown>;

/** An open connection to one database, with the models read from it. All records are keyed by property. */
export interface DatabaseConnection {
  readonly models: ModelDefinition[];
  find(model: ModelDefinition, args: FindArgs): Promise<DatabaseRecord[]>;
  count(model: ModelDefinition, where?: Where | null): Promise<number>;
  /** The record whose primary key equals `key`, or null. */
  findOne(
    model: ModelDefinition,
    key: DatabaseRecord,
  ): Promise<DatabaseRecord | null>;
  insert(
    model: ModelDefinition,
    input: DatabaseRecord,
  ): Promise<DatabaseRecord>;
  /** Updates the record with primary key `key`; null when there is none. */
  update(
    model: ModelDefinition,
    key: DatabaseRecord,
    input: DatabaseRecord,
  ): Promise<DatabaseRecord | null>;
  /** Deletes the record with primary key `key` and returns it; null when there is none. */
  delete(
    model: ModelDefinition,
    key: DatabaseRecord,
  ): Promise<DatabaseRecord | null>;
  close(): Promise<void>;
}

/** TLS settings; PEM contents, not file paths. */
export interface SslOptions {
  /** False accepts self-signed or otherwise unverified server certificates. */
  rejectUnauthorized?: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

export interface ConnectOptions {
  /** True turns TLS on with the defaults of the driver. */
  ssl?: boolean | SslOptions;
}

/** Knows how to read and write one kind of database. */
export interface DatabaseAdapter {
  /** Shown in errors, e.g. `postgres`. */
  readonly name: string;
  /** URL protocols this adapter handles, without the colon, e.g. `postgresql`. */
  readonly protocols: readonly string[];
  connect(url: string, options?: ConnectOptions): Promise<DatabaseConnection>;
}
