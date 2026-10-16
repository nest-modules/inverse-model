import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  databaseNameOf,
  generateProject,
  writeProject,
} from '@nestjs-modules/inverse-generator';
import { Command, CommandRunner, Option } from 'nest-commander';

interface GenerateOptions {
  out?: string;
  name?: string;
}

@Command({
  name: 'generate',
  arguments: '<connection-string>',
  description:
    'Generate a NestJS project that serves the database over GraphQL',
})
export class GenerateCommand extends CommandRunner {
  async run([connectionString]: string[], options: GenerateOptions) {
    try {
      await this.generate(connectionString, options);
    } catch (error) {
      console.error(`error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }

  private async generate(connectionString: string, options: GenerateOptions) {
    const databaseName = databaseNameOf(connectionString);
    const name = options.name ?? databaseName;
    const outDir = resolve(options.out ?? name);

    const existing = await readdir(outDir).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    if (existing.length > 0) {
      throw new Error(`${outDir} is not empty`);
    }

    const files = generateProject({
      name,
      databaseUrl: connectionString,
    });
    await writeProject(outDir, files);
    console.log(`Generated ${name} into ${outDir}`);
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
