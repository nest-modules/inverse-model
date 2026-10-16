import { Client } from 'pg';
import type { ColumnKind, DatabaseSchema, Table } from '../schema';

const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema'];

const COLUMNS_QUERY = `
  SELECT c.table_schema, c.table_name, c.column_name, c.data_type,
         c.is_nullable = 'YES' AS nullable,
         c.column_default IS NOT NULL OR c.is_identity = 'YES'
           OR c.is_generated = 'ALWAYS' AS has_default
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE t.table_type = 'BASE TABLE' AND c.table_schema <> ALL($1)
  ORDER BY c.table_schema, c.table_name, c.ordinal_position`;

// pg_constraint keeps the column order of composite keys; information_schema does not.
const CONSTRAINTS_QUERY = `
  SELECT n.nspname AS table_schema, cl.relname AS table_name, con.contype,
         ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
               ORDER BY k.ord)::text[] AS columns,
         ref.relname AS referenced_table,
         ARRAY(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
               ORDER BY k.ord)::text[] AS referenced_columns
  FROM pg_constraint con
  JOIN pg_class cl ON cl.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  LEFT JOIN pg_class ref ON ref.oid = con.confrelid
  WHERE con.contype IN ('p', 'f') AND n.nspname <> ALL($1)`;

export async function introspectPostgres(
  connectionString: string,
): Promise<DatabaseSchema> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows: columns } = await client.query(COLUMNS_QUERY, [
      SYSTEM_SCHEMAS,
    ]);
    const { rows: constraints } = await client.query(CONSTRAINTS_QUERY, [
      SYSTEM_SCHEMAS,
    ]);

    const tables = new Map<string, Table>();
    const tableOf = (schema: string, name: string) => {
      const key = `${schema}.${name}`;
      let table = tables.get(key);
      if (!table) {
        table = { schema, name, columns: [], primaryKey: [], foreignKeys: [] };
        tables.set(key, table);
      }
      return table;
    };

    for (const row of columns) {
      tableOf(row.table_schema, row.table_name).columns.push({
        name: row.column_name,
        dataType: row.data_type,
        kind: postgresKind(row.data_type),
        nullable: row.nullable,
        hasDefault: row.has_default,
      });
    }
    for (const row of constraints) {
      const table = tableOf(row.table_schema, row.table_name);
      if (row.contype === 'p') {
        table.primaryKey = row.columns;
      } else {
        table.foreignKeys.push({
          columns: row.columns,
          referencedTable: row.referenced_table,
          referencedColumns: row.referenced_columns,
        });
      }
    }

    return {
      dialect: 'postgres',
      name: client.database ?? '',
      tables: [...tables.values()],
    };
  } finally {
    await client.end();
  }
}

/** Maps an information_schema `data_type` to its portable kind. */
export function postgresKind(dataType: string): ColumnKind {
  switch (dataType) {
    case 'smallint':
    case 'integer':
      return 'int';
    case 'real':
    case 'double precision':
      return 'float';
    // pg returns these as strings to keep their precision.
    case 'bigint':
    case 'numeric':
    case 'text':
    case 'character varying':
    case 'character':
    case 'uuid':
    case 'USER-DEFINED':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'timestamp without time zone':
    case 'timestamp with time zone':
      return 'datetime';
    case 'json':
    case 'jsonb':
      return 'json';
    default:
      return 'unknown';
  }
}
