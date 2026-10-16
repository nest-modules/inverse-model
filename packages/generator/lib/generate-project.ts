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

/** Builds the files of a NestJS project that mounts `InverseModelModule` over the database. */
export const generateProject = (options: GenerateOptions): GeneratedFile[] =>
  projectFiles(options.name, options.databaseUrl);
