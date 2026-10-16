import type { ModelDefinition } from '../adapters/database-adapter.interface';
import type { InverseHooks } from '../hooks/write-hooks.interfaces';
import { createWrites } from '../hooks/writes';
import { blogModels, memoryDatabase } from './support/memory-database';

describe('write hooks', () => {
  let database: ReturnType<typeof memoryDatabase>;
  let authors: ModelDefinition;
  let audit: ModelDefinition;

  beforeEach(() => {
    database = memoryDatabase(blogModels());
    [authors, , audit] = database.connection.models;
  });

  const writesWith = (hooks: InverseHooks) =>
    createWrites(database.connection, hooks);

  it('runs the * hooks, then the table hooks, around the write in a transaction', async () => {
    const calls: string[] = [];
    const track =
      (name: string) =>
      ({ transaction }: { transaction: { active: boolean } }) => {
        calls.push(`${name}${transaction.active ? '' : ' (no transaction)'}`);
        database.log.push(name);
      };
    const writes = writesWith({
      '*': { beforeCreate: track('* before'), afterCreate: track('* after') },
      authors: {
        beforeCreate: [track('authors before 1'), track('authors before 2')],
        afterCreate: track('authors after'),
      },
    });

    await writes.create(authors, { fullName: 'Ada' });

    expect(calls).toEqual([
      '* before',
      'authors before 1',
      'authors before 2',
      '* after',
      'authors after',
    ]);
    expect(database.log).toEqual([
      'begin',
      '* before',
      'authors before 1',
      'authors before 2',
      'insert authors',
      '* after',
      'authors after',
      'commit',
    ]);
  });

  it('gives each hook the model, input, key, record and context', async () => {
    const beforeCreate = jest.fn();
    const afterCreate = jest.fn();
    const beforeUpdate = jest.fn();
    const afterUpdate = jest.fn();
    const beforeDelete = jest.fn();
    const afterDelete = jest.fn();
    const writes = writesWith({
      authors: {
        beforeCreate,
        afterCreate,
        beforeUpdate,
        afterUpdate,
        beforeDelete,
        afterDelete,
      },
    });
    const context = { user: 'ada' };

    const created = await writes.create(authors, { fullName: 'Ada' }, context);
    expect(beforeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: authors,
        input: { fullName: 'Ada' },
        key: null,
        record: null,
        context,
        transaction: expect.objectContaining({ active: true }),
      }),
    );
    expect(afterCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        key: { id: created.id },
        record: { id: created.id, fullName: 'Ada' },
      }),
    );

    await writes.update(authors, { id: created.id }, { fullName: 'Ada L.' });
    expect(beforeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { fullName: 'Ada L.' },
        key: { id: created.id },
        record: { id: created.id, fullName: 'Ada' },
      }),
    );
    expect(afterUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        record: { id: created.id, fullName: 'Ada L.' },
      }),
    );

    await writes.delete(authors, { id: created.id });
    expect(beforeDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {},
        record: { id: created.id, fullName: 'Ada L.' },
      }),
    );
    expect(afterDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        record: { id: created.id, fullName: 'Ada L.' },
      }),
    );
  });

  it('writes the input as the before-hooks return it, each from the last', async () => {
    const afterCreate = jest.fn();
    const writes = writesWith({
      '*': { beforeCreate: ({ input }) => ({ ...input, fullName: 'Ada' }) },
      authors: {
        beforeCreate: [
          // Returning nothing keeps the input.
          () => undefined,
          async ({ input }) => ({ ...input, fullName: `${input.fullName}!` }),
        ],
        afterCreate,
      },
    });

    await expect(
      writes.create(authors, { fullName: 'nobody' }),
    ).resolves.toMatchObject({ fullName: 'Ada!' });
    expect(database.rows('authors')).toEqual([{ id: 1, fullName: 'Ada!' }]);
    expect(afterCreate).toHaveBeenCalledWith(
      expect.objectContaining({ input: { fullName: 'Ada!' } }),
    );
  });

  it('aborts the write when a before-hook throws', async () => {
    const afterCreate = jest.fn();
    const writes = writesWith({
      authors: {
        beforeCreate: () => {
          throw new Error('Authors are closed');
        },
        afterCreate,
      },
    });

    await expect(writes.create(authors, { fullName: 'Ada' })).rejects.toThrow(
      'Authors are closed',
    );
    expect(database.log).toEqual(['begin', 'rollback']);
    expect(afterCreate).not.toHaveBeenCalled();
    expect(database.rows('authors')).toEqual([]);
  });

  it('rolls the write and the queries of its hooks back when an after-hook throws', async () => {
    const created = await database.connection.insert(authors, {
      fullName: 'Ada',
    });
    const writes = writesWith({
      authors: {
        beforeUpdate: ({ transaction, key }) =>
          transaction.connection
            .insert(audit, { message: `update ${key?.id}` })
            .then(() => undefined),
        afterUpdate: () => {
          throw new Error('nope');
        },
      },
    });

    await expect(
      writes.update(authors, { id: created.id }, { fullName: 'Changed' }),
    ).rejects.toThrow('nope');
    expect(database.rows('authors')).toEqual([{ id: 1, fullName: 'Ada' }]);
    expect(database.rows('audit_log')).toEqual([]);
  });

  it('commits the queries of its hooks with the write', async () => {
    const writes = writesWith({
      '*': {
        afterCreate: async ({ model, record, transaction }) => {
          if (model.source === 'audit_log') return;
          await transaction.connection.insert(audit, {
            message: `created ${model.source} ${record?.id}`,
          });
        },
      },
    });

    await writes.create(authors, { fullName: 'Ada' });

    expect(database.rows('audit_log')).toEqual([
      { id: 2, message: 'created authors 1' },
    ]);
    expect(database.log.filter((entry) => entry === 'begin')).toHaveLength(1);
  });

  it('skips the hooks and returns null when there is no record to update or delete', async () => {
    const beforeUpdate = jest.fn();
    const beforeDelete = jest.fn();
    const writes = writesWith({ authors: { beforeUpdate, beforeDelete } });

    await expect(
      writes.update(authors, { id: 9 }, { fullName: 'x' }),
    ).resolves.toBeNull();
    await expect(writes.delete(authors, { id: 9 })).resolves.toBeNull();
    expect(beforeUpdate).not.toHaveBeenCalled();
    expect(beforeDelete).not.toHaveBeenCalled();
  });

  it('writes straight to the connection when the table has no hooks', async () => {
    const writes = writesWith({ blog_posts: { beforeCreate: jest.fn() } });

    const created = await writes.create(authors, { fullName: 'Ada' });
    await writes.update(authors, { id: created.id }, { fullName: 'B' });
    await writes.delete(authors, { id: created.id });

    expect(database.log).toEqual([
      'insert authors',
      'update authors',
      'delete authors',
    ]);
  });

  it('runs the hooks without a transaction on a connection that has none', async () => {
    database = memoryDatabase(blogModels(), { transactions: false });
    [authors] = database.connection.models;
    const afterCreate = jest.fn(() => {
      throw new Error('too late');
    });
    const writes = writesWith({ authors: { afterCreate } });

    await expect(writes.create(authors, { fullName: 'Ada' })).rejects.toThrow(
      'too late',
    );
    expect(afterCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: { connection: database.connection, active: false },
      }),
    );
    // Nothing to roll back with: the record stays.
    expect(database.rows('authors')).toHaveLength(1);
  });
});
