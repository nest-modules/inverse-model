import 'reflect-metadata';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  generateProject,
  writeProject,
} from '@nestjs-modules/inverse-generator';
import { GenerateCommand } from '../generate.command';

jest.mock('node:fs/promises', () => ({ readdir: jest.fn() }));
jest.mock('@nestjs-modules/inverse-generator', () => ({
  generateProject: jest.fn(),
  writeProject: jest.fn(),
}));

const readdirMock = readdir as unknown as jest.Mock;
const generateProjectMock = generateProject as jest.Mock;
const writeProjectMock = writeProject as jest.Mock;

const URL = 'postgres://user:secret@localhost:5432/blog';
const FILES = [{ path: 'package.json', content: '{}' }];

describe('GenerateCommand', () => {
  const command = new GenerateCommand();

  beforeEach(() => {
    jest.resetAllMocks();
    readdirMock.mockResolvedValue([]);
    generateProjectMock.mockReturnValue(FILES);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('names the project and its directory after the database', async () => {
    await command.run([URL], {});

    expect(readdirMock).toHaveBeenCalledWith(resolve('blog'));
    expect(generateProjectMock).toHaveBeenCalledWith({
      name: 'blog',
      databaseUrl: URL,
    });
    expect(writeProjectMock).toHaveBeenCalledWith(resolve('blog'), FILES);
    expect(console.log).toHaveBeenCalledWith(
      `Generated blog into ${resolve('blog')}`,
    );
  });

  it('uses --name for the project and its directory', async () => {
    await command.run([URL], { name: 'blog-api' });

    expect(generateProjectMock).toHaveBeenCalledWith({
      name: 'blog-api',
      databaseUrl: URL,
    });
    expect(writeProjectMock).toHaveBeenCalledWith(resolve('blog-api'), FILES);
  });

  it('writes into --out', async () => {
    await command.run([URL], { name: 'blog-api', out: 'apps/api' });

    expect(readdirMock).toHaveBeenCalledWith(resolve('apps/api'));
    expect(generateProjectMock).toHaveBeenCalledWith({
      name: 'blog-api',
      databaseUrl: URL,
    });
    expect(writeProjectMock).toHaveBeenCalledWith(resolve('apps/api'), FILES);
  });

  it('creates an output directory that does not exist yet', async () => {
    readdirMock.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    await command.run([URL], {});

    expect(writeProjectMock).toHaveBeenCalledWith(resolve('blog'), FILES);
  });

  it('refuses a non-empty output directory', async () => {
    readdirMock.mockResolvedValue(['package.json']);

    await expect(command.run([URL], { out: 'existing' })).rejects.toThrow(
      `${resolve('existing')} is not empty`,
    );
    expect(generateProjectMock).not.toHaveBeenCalled();
    expect(writeProjectMock).not.toHaveBeenCalled();
  });

  it('passes option values through unchanged', () => {
    expect(command.parseOut('out')).toBe('out');
    expect(command.parseName('name')).toBe('name');
  });
});
