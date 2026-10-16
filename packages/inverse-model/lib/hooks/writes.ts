import type {
  DatabaseConnection,
  DatabaseRecord,
  DatabaseTransaction,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import type {
  AfterWriteHook,
  BeforeWriteHook,
  InverseHooks,
  WriteHookArgs,
} from './write-hooks.interfaces';

/** The writes of the generated mutations, with their hooks around them. */
export interface Writes {
  create(
    model: ModelDefinition,
    input: DatabaseRecord,
    context?: unknown,
  ): Promise<DatabaseRecord>;
  update(
    model: ModelDefinition,
    key: DatabaseRecord,
    input: DatabaseRecord,
    context?: unknown,
  ): Promise<DatabaseRecord | null>;
  delete(
    model: ModelDefinition,
    key: DatabaseRecord,
    context?: unknown,
  ): Promise<DatabaseRecord | null>;
}

type Step = 'Create' | 'Update' | 'Delete';

const asList = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const isRecord = (value: unknown): value is DatabaseRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Writes through `connection`, running the hooks of the table and of `*`.
 * A write with hooks runs with them in one transaction: a before-hook that
 * throws stops it, and an after-hook that throws rolls it back. A write
 * without hooks goes straight to the connection.
 */
export function createWrites(
  connection: DatabaseConnection,
  hooks: InverseHooks = {},
): Writes {
  const before = (model: ModelDefinition, step: Step) =>
    [
      ...asList(hooks['*']?.[`before${step}`]),
      ...asList(hooks[model.source]?.[`before${step}`]),
    ] as BeforeWriteHook[];
  const after = (model: ModelDefinition, step: Step) =>
    [
      ...asList(hooks['*']?.[`after${step}`]),
      ...asList(hooks[model.source]?.[`after${step}`]),
    ] as AfterWriteHook[];
  const hooked = (model: ModelDefinition, step: Step) =>
    before(model, step).length + after(model, step).length > 0;

  const keyOf = (model: ModelDefinition, record: DatabaseRecord) =>
    model.primaryKey.length > 0
      ? Object.fromEntries(
          model.primaryKey.map((property) => [property, record[property]]),
        )
      : null;

  const transaction = <T>(
    work: (transaction: DatabaseTransaction) => Promise<T>,
  ) =>
    connection.transaction
      ? connection.transaction(work)
      : work({ connection, active: false });

  /** Runs the before-hooks in order, each one getting the input the last returned. */
  async function runBefore(
    hooksToRun: BeforeWriteHook[],
    args: WriteHookArgs,
  ): Promise<DatabaseRecord> {
    let input = args.input;
    for (const hook of hooksToRun) {
      const result = await hook({ ...args, input });
      if (isRecord(result)) input = result;
    }
    return input;
  }

  async function runAfter(hooksToRun: AfterWriteHook[], args: WriteHookArgs) {
    for (const hook of hooksToRun) await hook(args);
  }

  return {
    create(model, input, context) {
      if (!hooked(model, 'Create')) return connection.insert(model, input);
      return transaction(async (transaction) => {
        const base = { model, key: null, record: null, context, transaction };
        const data = await runBefore(before(model, 'Create'), {
          ...base,
          input,
        });
        const record = await transaction.connection.insert(model, data);
        await runAfter(after(model, 'Create'), {
          ...base,
          input: data,
          key: keyOf(model, record),
          record,
        });
        return record;
      });
    },

    update(model, key, input, context) {
      if (!hooked(model, 'Update')) return connection.update(model, key, input);
      return transaction(async (transaction) => {
        // Nothing to update means nothing to hook.
        const current = await transaction.connection.findOne(model, key);
        if (!current) return null;
        const base = { model, key, context, transaction };
        const data = await runBefore(before(model, 'Update'), {
          ...base,
          input,
          record: current,
        });
        const record = await transaction.connection.update(model, key, data);
        if (!record) return null;
        await runAfter(after(model, 'Update'), {
          ...base,
          input: data,
          key: keyOf(model, record),
          record,
        });
        return record;
      });
    },

    delete(model, key, context) {
      if (!hooked(model, 'Delete')) return connection.delete(model, key);
      return transaction(async (transaction) => {
        const current = await transaction.connection.findOne(model, key);
        if (!current) return null;
        const base = { model, key, input: {}, context, transaction };
        await runBefore(before(model, 'Delete'), { ...base, record: current });
        const record = await transaction.connection.delete(model, key);
        if (!record) return null;
        await runAfter(after(model, 'Delete'), { ...base, record });
        return record;
      });
    },
  };
}
