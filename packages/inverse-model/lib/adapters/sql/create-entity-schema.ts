import {
  type ColumnType,
  EntitySchema,
  type EntitySchemaColumnOptions,
  type Table,
  type TableColumn,
} from 'typeorm';
import { camelCase, pascalCase } from '../../utils/naming';

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

/** `public.blog_posts` → `BlogPosts` */
export const entityNameOf = (tableName: string) =>
  pascalCase(tableName.split('.').pop() ?? tableName);

/**
 * Entity named after the table, one camelCase property per column. TypeORM
 * needs a primary key, so a table without one gets every column as its key;
 * such a table is only listed, never addressed by key.
 */
export function createEntitySchema(table: Table): EntitySchema {
  const hasPrimaryKey = table.columns.some((column) => column.isPrimary);
  return new EntitySchema({
    name: entityNameOf(table.name),
    tableName: table.name,
    columns: Object.fromEntries(
      table.columns.map((column) => [
        camelCase(column.name),
        columnOptions(column, hasPrimaryKey ? column.isPrimary : true),
      ]),
    ),
  });
}
