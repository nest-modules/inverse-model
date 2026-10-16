import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeProject } from '../write-project';

describe('writeProject', () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'inverse-generator-'));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it('writes each file under the output directory', async () => {
    await writeProject(outDir, [
      { path: 'package.json', content: '{}\n' },
      { path: '.env', content: 'PORT=3000\n' },
    ]);

    expect((await readdir(outDir)).sort()).toEqual(['.env', 'package.json']);
    expect(await readFile(join(outDir, 'package.json'), 'utf8')).toBe('{}\n');
    expect(await readFile(join(outDir, '.env'), 'utf8')).toBe('PORT=3000\n');
  });

  it('creates nested directories', async () => {
    await writeProject(outDir, [
      { path: 'src/modules/blog/blog.module.ts', content: 'export {};\n' },
    ]);

    expect(
      await readFile(join(outDir, 'src/modules/blog/blog.module.ts'), 'utf8'),
    ).toBe('export {};\n');
  });

  it('creates the output directory when it does not exist', async () => {
    const nested = join(outDir, 'new', 'project');

    await writeProject(nested, [{ path: 'README.md', content: '# x\n' }]);

    expect(await readFile(join(nested, 'README.md'), 'utf8')).toBe('# x\n');
  });

  it('overwrites a file that is already there', async () => {
    await writeFile(join(outDir, '.env'), 'OLD=1\n');

    await writeProject(outDir, [{ path: '.env', content: 'NEW=1\n' }]);

    expect(await readFile(join(outDir, '.env'), 'utf8')).toBe('NEW=1\n');
  });

  it('writes nothing for an empty project', async () => {
    await writeProject(outDir, []);

    expect(await readdir(outDir)).toEqual([]);
  });
});
