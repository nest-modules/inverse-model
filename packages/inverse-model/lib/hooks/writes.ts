import type {
  DatabaseConnection,
  DatabaseRecord,
  DatabaseTransaction,
  ModelDefinition,
  Where,
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
  /** Updates the record with the input's primary key, or creates it, with the hooks of that write. */
  upsert(
    model: ModelDefinition,
    input: DatabaseRecord,
    context?: unknown,
  ): Promise<DatabaseRecord>;
  /** Creates every record and returns how many; the create hooks run once per record. */
  createMany(
    model: ModelDefinition,
    inputs: DatabaseRecord[],
    context?: unknown,
  ): Promise<number>;
  /** Deletes the records matching `where` and returns how many; the delete hooks run once per record. */
  deleteMany(
    model: ModelDefinition,
    where: Where | null | undefined,
    context?: unknown,
  ): Promise<number>;
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

  async function createIn(
    transaction: DatabaseTransaction,
    model: ModelDefinition,
    input: DatabaseRecord,
    context: unknown,
  ) {
    const base = { model, key: null, record: null, context, transaction };
    const data = await runBefore(before(model, 'Create'), { ...base, input });
    const record = await transaction.connection.insert(model, data);
    await runAfter(after(model, 'Create'), {
      ...base,
      input: data,
      key: keyOf(model, record),
      record,
    });
    return record;
  }

  async function updateIn(
    transaction: DatabaseTransaction,
    model: ModelDefinition,
    key: DatabaseRecord,
    input: DatabaseRecord,
    context: unknown,
  ) {
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
  }

  async function deleteIn(
    transaction: DatabaseTransaction,
    model: ModelDefinition,
    key: DatabaseRecord,
    context: unknown,
  ) {
    const current = await transaction.connection.findOne(model, key);
    if (!current) return null;
    const base = { model, key, input: {}, context, transaction };
    await runBefore(before(model, 'Delete'), { ...base, record: current });
    const record = await transaction.connection.delete(model, key);
    if (!record) return null;
    await runAfter(after(model, 'Delete'), { ...base, record });
    return record;
  }

  /** The primary key in `input`, or null when part of it is missing. */
  const keyIn = (model: ModelDefinition, input: DatabaseRecord) => {
    const key = keyOf(model, input);
    return key && Object.values(key).every((value) => value != null)
      ? key
      : null;
  };

  return {
    create(model, input, context) {
      if (!hooked(model, 'Create')) return connection.insert(model, input);
      return transaction((transaction) =>
        createIn(transaction, model, input, context),
      );
    },

    update(model, key, input, context) {
      if (!hooked(model, 'Update')) return connection.update(model, key, input);
      return transaction((transaction) =>
        updateIn(transaction, model, key, input, context),
      );
    },

    delete(model, key, context) {
      if (!hooked(model, 'Delete')) return connection.delete(model, key);
      return transaction((transaction) =>
        deleteIn(transaction, model, key, context),
      );
    },

    upsert(model, input, context) {
      if (!hooked(model, 'Create') && !hooked(model, 'Update')) {
        return connection.upsert(model, input);
      }
      return transaction(async (transaction) => {
        const key = keyIn(model, input);
        if (key && (await transaction.connection.findOne(model, key))) {
          const changes = Object.fromEntries(
            Object.entries(input).filter(
              ([property]) => !model.primaryKey.includes(property),
            ),
          );
          return (await updateIn(
            transaction,
            model,
            key,
            changes,
            context,
          )) as DatabaseRecord;
        }
        return createIn(transaction, model, input, context);
      });
    },

    createMany(model, inputs, context) {
      if (!hooked(model, 'Create')) return connection.insertMany(model, inputs);
      return transaction(async (transaction) => {
        for (const input of inputs) {
          await createIn(transaction, model, input, context);
        }
        return inputs.length;
      });
    },

    deleteMany(model, where, context) {
      if (!hooked(model, 'Delete')) return connection.deleteMany(model, where);
      return transaction(async (transaction) => {
        const records = await transaction.connection.find(model, { where });
        let deleted = 0;
        for (const record of records) {
          const key = keyOf(model, record) as DatabaseRecord;
          if (await deleteIn(transaction, model, key, context)) deleted++;
        }
        return deleted;
      });
    },
  };
}
