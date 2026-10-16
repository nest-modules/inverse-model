import {
  type ColumnType,
  EntitySchema,
  type EntitySchemaColumnOptions,
  type Table,
  type TableColumn,
} from 'typeorm';
import type { Naming } from '../../utils/naming';

// EntitySchema has no `identity` strategy; both are filled in by the database on insert.
const generationOf = (column: TableColumn) =>
  column.generationStrategy === 'identity'
    ? 'increment'
    : column.generationStrategy;

function columnOptions(
  column: TableColumn,
  primary: boolean,
): EntitySchemaColumnOptions {
  return {
    name: column.name,
    type: column.type as ColumnType,
    primary,
    nullable: column.isNullable,
    array: column.isArray,
    enum: column.enum,
    generated: column.isGenerated ? generationOf(column) : undefined,
    // Introspected defaults are SQL expressions, so they go through as raw SQL.
    default: column.default === undefined ? undefined : () => column.default,
  };
}

/** Names of the columns of a table that `naming` turns into the same property. */
function clashingColumns(table: Table, naming: Naming): string | undefined {
  const byProperty = new Map<string, string[]>();
  for (const column of table.columns) {
    const property = naming.field(column.name, table.name);
    byProperty.set(property, [
      ...(byProperty.get(property) ?? []),
      column.name,
    ]);
  }
  const [property, columns] =
    [...byProperty].find(([, columns]) => columns.length > 1) ?? [];
  return (
    property &&
    `Columns ${columns?.join(', ')} of table ${table.name} all become the field ${property}; ` +
      'rename them with the `naming.field` option of InverseModelModule.'
  );
}

/**
 * Entity of a table, one property per column named by `naming.field`.
 * TypeORM needs a primary key, so a table without one gets every column as
 * its key; such a table is only listed, never addressed by key. The entity
 * name is internal and only has to be unique.
 */
export function createEntitySchema(
  table: Table,
  entityName: string,
  naming: Naming,
): EntitySchema {
  const clash = clashingColumns(table, naming);
  if (clash) throw new Error(clash);
  const hasPrimaryKey = table.columns.some((column) => column.isPrimary);
  return new EntitySchema({
    name: entityName,
    tableName: table.name,
    columns: Object.fromEntries(
      table.columns.map((column) => [
        naming.field(column.name, table.name),
        columnOptions(column, hasPrimaryKey ? column.isPrimary : true),
      ]),
    ),
  });
}
