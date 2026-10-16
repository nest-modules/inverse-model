import { type QueryRunner, Table, TableForeignKey } from 'typeorm';
import type { ViewOptions } from '../database-adapter.interface';

export interface ViewQueries {
  /** Lists the views to expose as one `name` column, named as in `tablesQuery`. */
  viewsQuery?: string;
  /**
   * Columns of every view, as rows of `table_name`, `column_name`,
   * `data_type` and `is_nullable` (`YES` or `NO`) in column order, for a
   * driver whose getTables() skips views (SQL Server).
   */
  viewColumnsQuery?: string;
}

interface ViewColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

async function viewTables(
  queryRunner: QueryRunner,
  queries: ViewQueries,
  names: string[],
): Promise<Table[]> {
  if (!queries.viewColumnsQuery) return queryRunner.getTables(names);
  const rows: ViewColumnRow[] = await queryRunner.query(
    queries.viewColumnsQuery,
  );
  return names.map(
    (name) =>
      new Table({
        name,
        columns: rows
          .filter((row) => row.table_name === name)
          .map((row) => ({
            name: row.column_name,
            type: row.data_type,
            isNullable: row.is_nullable === 'YES',
          })),
      }),
  );
}

/** Options of a view, given by its name with or without the schema. */
const optionsOf = (
  table: Table,
  views: Readonly<Record<string, ViewOptions>>,
): ViewOptions =>
  views[table.name] ?? views[table.name.split('.').pop() as string] ?? {};

/** Marks the declared key and adds the declared foreign keys, which a view never has of its own. */
function applyOptions(table: Table, options: ViewOptions): Table {
  const columns = new Set(table.columns.map((column) => column.name));
  const check = (names: string[]) => {
    const unknown = names.filter((name) => !columns.has(name));
    if (unknown.length > 0) {
      throw new Error(
        `View ${table.name} has no column ${unknown.join(', ')}; check the views option`,
      );
    }
  };

  const primaryKey = options.primaryKey ?? [];
  check(primaryKey);
  for (const column of table.columns) {
    column.isPrimary = primaryKey.includes(column.name);
  }
  for (const key of options.foreignKeys ?? []) {
    check(key.columns);
    table.foreignKeys.push(
      new TableForeignKey({
        columnNames: key.columns,
        referencedTableName: key.table,
        referencedColumnNames: key.references,
      }),
    );
  }
  return table;
}

/** Views of the database as tables, with what `views` declares about them. */
export async function readViews(
  queryRunner: QueryRunner,
  queries: ViewQueries,
  views: Readonly<Record<string, ViewOptions>> = {},
): Promise<Table[]> {
  if (!queries.viewsQuery) return [];
  const rows: { name: string }[] = await queryRunner.query(queries.viewsQuery);
  const names = rows.map((row) => row.name);
  if (names.length === 0) return [];
  const tables = await viewTables(queryRunner, queries, names);
  return tables.map((table) => applyOptions(table, optionsOf(table, views)));
}
