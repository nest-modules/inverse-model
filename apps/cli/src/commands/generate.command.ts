import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  generateProject,
  writeProject,
} from '@nestjs-modules/inverse-generator';
import { introspect } from '@nestjs-modules/inverse-introspector';
import { Command, CommandRunner, Option } from 'nest-commander';

interface GenerateOptions {
  out?: string;
  name?: string;
}

@Command({
  name: 'generate',
  arguments: '<connection-string>',
  description: 'Generate a NestJS GraphQL project from an existing database',
})
export class GenerateCommand extends CommandRunner {
  async run([connectionString]: string[], options: GenerateOptions) {
    const schema = await introspect(connectionString);
    const name = options.name ?? schema.name;
    const outDir = resolve(options.out ?? name);

    const existing = await readdir(outDir).catch(() => []);
    if (existing.length > 0) {
      throw new Error(`${outDir} is not empty`);
    }

    const files = generateProject(schema, {
      name,
      databaseUrl: connectionString,
    });
    await writeProject(outDir, files);
    console.log(`Generated ${schema.tables.length} tables into ${outDir}`);
  }

  @Option({
    flags: '-o, --out <dir>',
    description: 'Output directory, the project name by default',
  })
  parseOut(value: string) {
    return value;
  }

  @Option({
    flags: '-n, --name <name>',
    description: 'Project name, the database name by default',
  })
  parseName(value: string) {
    return value;
  }
}
