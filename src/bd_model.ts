// bd_model.ts Define la estructura motor de base de datos

export type SupportedSqlType = 'string' | 'number' | 'boolean' | 'date' | 'unknown';

export interface ColumnMetadata {
  name: string;
  dataType: string;         // Tipo original en la BD (ej. 'varchar', 'integer')
  normalizedType: SupportedSqlType; // Tipo unificado para GraphQL
  isNullable: boolean;
  isPrimaryKey: boolean;
}

export interface TableMetadata {
  name: string;
  columns: ColumnMetadata[];
}

export interface DatabaseMetadata {
  tables: TableMetadata[];
}

// Patrón Strategy: implementacion de interfaz
export interface DatabaseIntrospector {
  introspect(): Promise<DatabaseMetadata>;
  executeQuery(query: string, params?: any[]): Promise<any[]>;
} 