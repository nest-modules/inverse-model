// model-service.ts Define la estructura de la URI y recorrido de los objetos de la 
// base de datos.

import { Client } from 'pg';
import { DatabaseIntrospector, DatabaseMetadata, SupportedSqlType, TableMetadata } from './bd_model';

export interface PostgresConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}

export class PostgresStrategy implements DatabaseIntrospector {
  private client: Client;

  // Acepta string (URI) O el objeto PostgresConfig
  constructor(config: string | PostgresConfig) {
    if (typeof config === 'string') {
      this.client = new Client({ connectionString: config });
    } else {
      this.client = new Client(config);
    }
  }

  // Normaliza el tipo de dato SQL al tipo simplificado que entenderá GraphQL
  private mapSqlType(dataType: string): SupportedSqlType {
    const type = dataType.toLowerCase();
    if (['varchar', 'text', 'char', 'uuid'].includes(type)) return 'string';
    if (['integer', 'int', 'smallint', 'bigint', 'decimal', 'numeric', 'real'].includes(type)) return 'number';
    if (['boolean'].includes(type)) return 'boolean';
    if (['timestamp', 'timestamp without time zone', 'date'].includes(type)) return 'date'; 
    return 'unknown';
  }

  async introspect(): Promise<DatabaseMetadata> {
    await this.client.connect();

    // Consulta estándar a information_schema para extraer tablas y columnas
    const columnsQuery = `
      SELECT 
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      ORDER BY c.table_name, c.ordinal_position;
    `;

    const result = await this.client.query(columnsQuery);

    const tablesMap = new Map<string, TableMetadata>();

    for (const row of result.rows) {
      const tableName = row.table_name;
      if (!tablesMap.has(tableName)) {
        tablesMap.set(tableName, { name: tableName, columns: [] });
      }

      tablesMap.get(tableName)!.columns.push({
        name: row.column_name,
        dataType: row.data_type,
        normalizedType: this.mapSqlType(row.data_type),
        isNullable: row.is_nullable === 'YES',
        isPrimaryKey: false, 
      });
    }

    return { tables: Array.from(tablesMap.values()) };
  }

  async executeQuery(query: string, params: any[] = []): Promise<any[]> {
    const res = await this.client.query(query, params);
    return res.rows;
  }
}