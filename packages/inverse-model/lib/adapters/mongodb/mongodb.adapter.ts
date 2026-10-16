import type {
  ClientSession,
  Db,
  Document,
  Filter,
  MongoClient,
  MongoClientOptions,
  ObjectId,
} from 'mongodb';
import type { Naming } from '../../utils/naming';
import type {
  ConnectOptions,
  DatabaseAdapter,
  DatabaseConnection,
  DatabaseRecord,
  ModelDefinition,
} from '../database-adapter.interface';
import { addRelations } from '../relations';
import { inferForeignKeys, inferModel } from './infer-model';
import { mongoFilter } from './mongo-filter';

/** Documents read per collection to infer its fields. */
const SAMPLE_SIZE = 100;

type Mongo = typeof import('mongodb');

async function readModels(db: Db, naming?: Naming) {
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
      return inferModel(name, sample, naming);
    }),
  );
}

function tlsOptions({ ssl }: ConnectOptions): MongoClientOptions {
  if (ssl === undefined) return {};
  if (typeof ssl === 'boolean') return { tls: ssl };
  return {
    tls: true,
    ca: ssl.ca,
    cert: ssl.cert,
    key: ssl.key,
    tlsAllowInvalidCertificates: ssl.rejectUnauthorized === false,
  };
}

/**
 * Whether the server can run transactions: a replica set member or a mongos.
 * A standalone server cannot.
 */
async function supportsTransactions(db: Db): Promise<boolean> {
  try {
    const hello = await db.admin().command({ hello: 1 });
    return Boolean(hello.setName) || hello.msg === 'isdbgrid';
  } catch {
    return false;
  }
}

interface MongoTarget {
  mongo: Mongo;
  client: MongoClient;
  db: Db;
  models: ModelDefinition[];
  transactions: boolean;
}

/** Operations on the database, inside `session`'s transaction when given. */
function connectionOver(
  target: MongoTarget,
  session?: ClientSession,
): DatabaseConnection {
  const { mongo, client, db, models } = target;
  const options = { session };
  const { ObjectId } = mongo;
  const toId = (value: unknown) =>
    typeof value === 'string' && ObjectId.isValid(value) && value.length === 24
      ? new ObjectId(value)
      : value;
  const isObjectId = (value: unknown): value is ObjectId =>
    (value as { _bsontype?: string } | null)?._bsontype === 'ObjectId';

  const collection = (model: ModelDefinition) => db.collection(model.source);

  /** Document → record keyed by property, with ObjectIds as hex strings. */
  const toRecord = (model: ModelDefinition, document: DatabaseRecord) =>
    Object.fromEntries(
      model.fields.map((field) => {
        const value = document[field.name];
        return [
          field.property,
          isObjectId(value) ? value.toHexString() : value,
        ];
      }),
    );

  /** Record keyed by property → document; `_id` is left to the database unless given. */
  const toDocument = (model: ModelDefinition, input: DatabaseRecord) => {
    const document: DatabaseRecord = {};
    for (const field of model.fields) {
      const value = input[field.property];
      if (value === undefined) continue;
      document[field.name] = field.type === 'ID' ? toId(value) : value;
    }
    return document;
  };

  // `_id` may be an ObjectId or, for documents inserted with their own id, anything else.
  const byKey = (key: DatabaseRecord) =>
    ({ _id: toId(key.id) }) as Filter<Document>;
  const findOne = async (model: ModelDefinition, key: DatabaseRecord) => {
    const document = await collection(model).findOne(byKey(key), options);
    return document && toRecord(model, document);
  };

  const connection: DatabaseConnection = {
    models,
    async find(model, { where, orderBy, limit, offset }) {
      const sort = (orderBy ?? []).flatMap((entry) =>
        Object.entries(entry).map(([property, direction]): [string, 1 | -1] => [
          model.fields.find((field) => field.property === property)?.name ??
            property,
          direction === 'DESC' ? -1 : 1,
        ]),
      );
      let cursor = collection(model)
        .find(mongoFilter(where, model, toId), options)
        .sort(sort);
      if (offset) cursor = cursor.skip(offset);
      if (limit !== undefined && limit !== null) cursor = cursor.limit(limit);
      const documents = await cursor.toArray();
      return documents.map((document) => toRecord(model, document));
    },
    count: (model, where) =>
      collection(model).countDocuments(
        mongoFilter(where, model, toId),
        options,
      ),
    findOne,
    async insert(model, input) {
      const { insertedId } = await collection(model).insertOne(
        toDocument(model, input),
        options,
      );
      return (await findOne(model, { id: insertedId.toHexString() })) ?? input;
    },
    async update(model, key, input) {
      const changes = toDocument(model, input);
      delete changes._id;
      if (Object.keys(changes).length > 0) {
        await collection(model).updateOne(
          byKey(key),
          { $set: changes },
          options,
        );
      }
      return findOne(model, key);
    },
    async delete(model, key) {
      const document = await collection(model).findOneAndDelete(
        byKey(key),
        options,
      );
      return document && toRecord(model, document);
    },
    async transaction(work) {
      if (session?.inTransaction()) {
        return work({ connection, active: true, session, db });
      }
      if (!target.transactions) {
        return work({ connection, active: false, db });
      }
      // Not withTransaction(): it retries `work`, which would run hooks twice.
      const transactionSession = client.startSession();
      try {
        transactionSession.startTransaction();
        const result = await work({
          connection: connectionOver(target, transactionSession),
          active: true,
          session: transactionSession,
          db,
        });
        await transactionSession.commitTransaction();
        return result;
      } catch (error) {
        if (transactionSession.inTransaction()) {
          await transactionSession.abortTransaction();
        }
        throw error;
      } finally {
        await transactionSession.endSession();
      }
    },
    // Only the connection the adapter opened owns the client.
    close: async () => {
      if (!session) await client.close();
    },
  };
  return connection;
}

/** MongoDB through its native driver; needs the `mongodb` package. */
export const mongodbAdapter: DatabaseAdapter = {
  name: 'mongodb',
  protocols: ['mongodb', 'mongodb+srv'],
  async connect(url, options = {}) {
    // Required here so the driver is only needed by apps that use MongoDB.
    const mongo = require('mongodb') as Mongo;
    const client = await new mongo.MongoClient(
      url,
      tlsOptions(options),
    ).connect();
    const db = client.db();

    const models = await readModels(db, options.naming).catch(async (error) => {
      await client.close();
      throw error;
    });
    addRelations(inferForeignKeys(models));

    return connectionOver({
      mongo,
      client,
      db,
      models,
      transactions: await supportsTransactions(db),
    });
  },
};
