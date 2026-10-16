import type { Db } from 'mongodb';
import type {
  DatabaseAdapter,
  DatabaseConnection,
  ModelDefinition,
} from '../database-adapter.interface';
import { inferModel } from './infer-model';

/** Documents read per collection to infer its fields. */
const SAMPLE_SIZE = 100;

async function readModels(db: Db) {
  const collections = await db
    .listCollections({ type: 'collection' }, { nameOnly: true })
    .toArray();
  const names = collections
    .map((collection) => collection.name)
    .filter((name) => !name.startsWith('system.'));

  return Promise.all(
    names.map(async (name) => {
      const sample = await db
        .collection(name)
        .aggregate([{ $sample: { size: SAMPLE_SIZE } }])
        .toArray();
      return { collection: name, model: inferModel(name, sample) };
    }),
  );
}

/** MongoDB through its native driver; needs the `mongodb` package. */
export const mongodbAdapter: DatabaseAdapter = {
  name: 'mongodb',
  protocols: ['mongodb', 'mongodb+srv'],
  async connect(url): Promise<DatabaseConnection> {
    // Required here so the driver is only needed by apps that use MongoDB.
    const { MongoClient, ObjectId } =
      require('mongodb') as typeof import('mongodb');
    const client = await new MongoClient(url).connect();
    const db = client.db();

    const entries = await readModels(db).catch(async (error) => {
      await client.close();
      throw error;
    });
    const collectionOf = new Map<ModelDefinition, string>(
      entries.map(({ collection, model }) => [model, collection]),
    );

    return {
      models: entries.map(({ model }) => model),
      async insert(model, input) {
        const document: Record<string, unknown> = {};
        for (const field of model.fields) {
          const value = input[field.property];
          if (value === undefined) continue;
          document[field.name] =
            field.type === 'ID' && ObjectId.isValid(value as string)
              ? new ObjectId(value as string)
              : value;
        }

        const { insertedId } = await db
          .collection(collectionOf.get(model) ?? model.name)
          .insertOne(document);
        return { ...input, id: String(insertedId) };
      },
      close: () => client.close(),
    };
  },
};
