/** Driver-neutral description of a database, the only input the generator reads. */
export interface DatabaseSchema {
  dialect: Dialect;
  name: string;
  tables: Table[];
}

export type Dialect = 'postgres';

export interface Table {
  schema: string;
  name: string;
  columns: Column[];
  primaryKey: string[];
  foreignKeys: ForeignKey[];
}

export interface Column {
  name: string;
  /** Type as the database reports it, e.g. `character varying`. */
  dataType: string;
  kind: ColumnKind;
  nullable: boolean;
  hasDefault: boolean;
}

/** Portable family of a column type, so templates never read dialect names. */
export type ColumnKind =
  | 'string'
  | 'int'
  | 'float'
  | 'boolean'
  | 'datetime'
  | 'json'
  | 'unknown';

export interface ForeignKey {
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
}
