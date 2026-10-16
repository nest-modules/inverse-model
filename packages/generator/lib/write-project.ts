import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { GeneratedFile } from './generate-project';

export async function writeProject(
  outDir: string,
  files: GeneratedFile[],
): Promise<void> {
  for (const file of files) {
    const target = join(outDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
}
