import {
  type ColumnType,
  EntitySchema,
  type EntitySchemaColumnOptions,
} from 'typeorm';
import type { Table } from 'typeorm/schema-builder/table/Table';
import type { TableColumn } from 'typeorm/schema-builder/table/TableColumn';
import { camelCase, pascalCase } from '../utils/naming';

// EntitySchema has no `identity` strategy; both are filled in by the database on insert.
const generationOf = (column: TableColumn) =>
  column.generationStrategy === 'identity'
    ? 'increment'
    : column.generationStrategy;

function columnOptions(column: TableColumn): EntitySchemaColumnOptions {
  return {
    name: column.name,
    type: column.type as ColumnType,
    primary: column.isPrimary,
    nullable: column.isNullable,
    array: column.isArray,
    enum: column.enum,
    generated: column.isGenerated ? generationOf(column) : undefined,
    // Introspected defaults are SQL expressions, so they go through as raw SQL.
    default: column.default === undefined ? undefined : () => column.default,
  };
}

/** Entity named after the table (`blog_posts` → `BlogPosts`), one camelCase property per column. */
export function createEntitySchema(table: Table): EntitySchema {
  const tableName = table.name.split('.').pop() ?? table.name;
  return new EntitySchema({
    name: pascalCase(tableName),
    tableName: table.name,
    columns: Object.fromEntries(
      table.columns.map((column) => [
        camelCase(column.name),
        columnOptions(column),
      ]),
    ),
  });
}
