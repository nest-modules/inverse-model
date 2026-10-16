import type { EntityManager } from 'typeorm';
import type { Naming } from '../utils/naming';

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
 * holding the key to the row it references; `many` is the way back, or a key
 * holding an array of references (MongoDB).
 */
export interface RelationDefinition {
  /** Property in the GraphQL API, e.g. `author` or `blogPosts`. */
  property: string;
  kind: 'one' | 'many';
  /** Name of the related model. */
  target: string;
  /** Properties of this model whose values are looked up; more than one for a composite key. */
  fields: string[];
  /** Properties of the related model that must equal `fields`, in the same order. */
  references: string[];
}

/** A table or collection of the database. */
export interface ModelDefinition {
  /** GraphQL type name, e.g. `BlogPost`. */
  name: string;
  /** Plural of `name` for lists, e.g. `BlogPosts`; the English plural of `name` when left out. */
  plural?: string;
  /** Table or collection name in the database, e.g. `blog_posts`. */
  source: string;
  fields: FieldDefinition[];
  /** Properties of the primary key; empty when the table has none. */
  primaryKey: string[];
  relations: RelationDefinition[];
  /** Exposed without create, update or delete mutations: a view, or a table made read-only. */
  readOnly?: boolean;
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

/**
 * Filter on a `many` relation: some, none or every related record matches.
 * A `one` relation is filtered with a plain Where on the related model.
 */
export interface RelationFilter {
  some?: Where | null;
  none?: Where | null;
  every?: Where | null;
}

/** Filter keyed by field or relation property, combined with AND, OR and NOT. */
export type Where = {
  AND?: Where[] | null;
  OR?: Where[] | null;
  NOT?: Where | null;
} & {
  [property: string]:
    | FieldFilter
    | RelationFilter
    | Where
    | Where[]
    | null
    | undefined;
};

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
  /**
   * Runs `work` in one transaction, committed when it resolves and rolled
   * back when it throws. Called on a connection already in a transaction, it
   * joins that one. A connection without it runs writes one by one.
   */
  transaction?<T>(
    work: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<T>;
  /** Updates the record with the primary key in `input`, or creates it when there is none. */
  upsert(
    model: ModelDefinition,
    input: DatabaseRecord,
  ): Promise<DatabaseRecord>;
  /** Creates every record in one statement and returns how many. */
  insertMany(model: ModelDefinition, inputs: DatabaseRecord[]): Promise<number>;
  /** Deletes every record matching `where` and returns how many. */
  deleteMany(model: ModelDefinition, where?: Where | null): Promise<number>;
  /** Whether nulls sort before every other value in ascending order. */
  readonly nullsFirst: boolean;
  close(): Promise<void>;
}

/** A transaction in progress; reads and writes through `connection` are part of it. */
export interface DatabaseTransaction {
  readonly connection: DatabaseConnection;
  /**
   * False when the database cannot run transactions (MongoDB without a
   * replica set): each write then applies on its own and nothing rolls back.
   */
  readonly active: boolean;
  /** TypeORM entity manager of the transaction, on SQL databases. */
  readonly manager?: EntityManager;
  /** MongoDB `ClientSession` of the transaction; pass it as `{ session }` to driver calls. */
  readonly session?: unknown;
  /** MongoDB `Db` the connection reads. */
  readonly db?: unknown;
}

/** TLS settings; PEM contents, not file paths. */
export interface SslOptions {
  /** False accepts self-signed or otherwise unverified server certificates. */
  rejectUnauthorized?: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

/** A foreign key a view's rows hold, in column names. */
export interface ViewForeignKey {
  columns: string[];
  /** Referenced table or view, e.g. `authors`. */
  table: string;
  references: string[];
}

/** What a view cannot tell about itself: its key and the keys it holds. */
export interface ViewOptions {
  /** Columns that identify a row; gives the view a by-key query and cursor pagination. */
  primaryKey?: string[];
  /** Gives the view relations both ways, as a table's foreign keys do. */
  foreignKeys?: ViewForeignKey[];
}

export interface ConnectOptions {
  /** True turns TLS on with the defaults of the driver. */
  ssl?: boolean | SslOptions;
  /** How tables and columns are named in the API; the defaults of `defaultNaming` when left out. */
  naming?: Naming;
  /** Per view name, with or without its schema. */
  views?: Readonly<Record<string, ViewOptions>>;
}

/** Knows how to read and write one kind of database. */
export interface DatabaseAdapter {
  /** Shown in errors, e.g. `postgres`. */
  readonly name: string;
  /** URL protocols this adapter handles, without the colon, e.g. `postgresql`. */
  readonly protocols: readonly string[];
  connect(url: string, options?: ConnectOptions): Promise<DatabaseConnection>;
}
