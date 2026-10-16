import type { DatabaseSchema } from '@nestjs-modules/inverse-introspector';
import { databaseFiles } from './templates/database';
import { entityFiles, entityNames } from './templates/entity';
import { projectFiles } from './templates/project';

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerateOptions {
  /** npm name of the generated project. */
  name: string;
  /** Written to the project's `.env` as `DATABASE_URL`. */
  databaseUrl: string;
}

/** Builds every file of a NestJS GraphQL project that exposes one `create<Table>` mutation per table. */
export function generateProject(
  schema: DatabaseSchema,
  options: GenerateOptions,
): GeneratedFile[] {
  const entities = schema.tables.map(entityNames);
  return [
    ...projectFiles(options.name, options.databaseUrl, entities),
    ...databaseFiles(),
    ...schema.tables.flatMap(entityFiles),
  ];
}
