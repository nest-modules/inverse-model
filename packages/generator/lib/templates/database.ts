import type { GeneratedFile } from '../generate-project';

/** Global pg pool shared by every entity service. */
export const databaseFiles = (): GeneratedFile[] => [
  {
    path: 'src/database/database.module.ts',
    content: `import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
`,
  },
  {
    path: 'src/database/database.service.ts',
    content: `import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

const quote = (name: string) => \`"\${name.replace(/"/g, '""')}"\`;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });

  /**
   * Inserts one row and returns it keyed by model field. Undefined values are
   * left out so the column defaults apply.
   */
  async insert<T>(
    table: string,
    values: Record<string, unknown>,
    fields: Record<string, string>,
  ): Promise<T> {
    const columns = Object.keys(values).filter((column) => values[column] !== undefined);
    const returning = Object.entries(fields)
      .map(([field, column]) => \`\${quote(column)} AS \${quote(field)}\`)
      .join(', ');
    const sql = columns.length
      ? \`INSERT INTO \${table} (\${columns.map(quote).join(', ')}) VALUES (\${columns.map((_, i) => \`$\${i + 1}\`).join(', ')}) RETURNING \${returning}\`
      : \`INSERT INTO \${table} DEFAULT VALUES RETURNING \${returning}\`;
    const { rows } = await this.pool.query(sql, columns.map((column) => values[column]));
    return rows[0];
  }

  onModuleDestroy() {
    return this.pool.end();
  }
}
`,
  },
];
