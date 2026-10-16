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
  FieldDefinition,
  ModelDefinition,
  Where,
} from '../database-adapter.interface';
import { addRelations } from '../relations';
import { inferDbRefs, inferForeignKeys, inferModel } from './infer-model';
import { mongoFilter } from './mongo-filter';
import { resolveRelationFilters } from './relation-filter';

/** Documents read per collection to infer its fields. */
const SAMPLE_SIZE = 100;

type Mongo = typeof import('mongodb');

/** Collection each DBRef field points at, by field name, per collection. */
type DbRefs = Map<string, Map<string, string>>;

async function readModels(db: Db, naming?: Naming) {
  const collections = await db
    .listCollections({ type: 'collection' }, { nameOnly: true })
    .toArray();
  const names = collections
    .map((collection) => collection.name)
    .filter((name) => !name.startsWith('system.'));

  const dbRefs: DbRefs = new Map();
  const models = await Promise.all(
    names.map(async (name) => {
      const sample = await db
        .collection(name)
        .aggregate([{ $sample: { size: SAMPLE_SIZE } }])
        .toArray();
      dbRefs.set(name, inferDbRefs(sample));
      return inferModel(name, sample, naming);
    }),
  );
  return { models, dbRefs };
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
  dbRefs: DbRefs;
  transactions: boolean;
}

/** Operations on the database, inside `session`'s transaction when given. */
function connectionOver(
  target: MongoTarget,
  session?: ClientSession,
): DatabaseConnection {
  const { mongo, client, db, models, dbRefs } = target;
  const options = { session };
  const { ObjectId, DBRef } = mongo;
  const toId = (value: unknown) =>
    typeof value === 'string' && ObjectId.isValid(value) && value.length === 24
      ? new ObjectId(value)
      : value;
  const isObjectId = (value: unknown): value is ObjectId =>
    (value as { _bsontype?: string } | null)?._bsontype === 'ObjectId';

  const isDbRef = (value: unknown): value is InstanceType<typeof DBRef> =>
    (value as { _bsontype?: string } | null)?._bsontype === 'DBRef';

  const collection = (model: ModelDefinition) => db.collection(model.source);
  const dbRefOf = (model: ModelDefinition, field: FieldDefinition) =>
    dbRefs.get(model.source)?.get(field.name);
  /** Path a field is queried and sorted by; a DBRef by the id inside it. */
  const pathOf = (model: ModelDefinition) => (field: FieldDefinition) =>
    dbRefOf(model, field) ? `${field.name}.$id` : field.name;

  /** ObjectIds as hex strings and DBRefs as the hex id they hold, in arrays too. */
  const fromBson = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(fromBson);
    if (isDbRef(value)) return fromBson(value.oid);
    return isObjectId(value) ? value.toHexString() : value;
  };

  /** Document → record keyed by property. */
  const toRecord = (model: ModelDefinition, document: DatabaseRecord) =>
    Object.fromEntries(
      model.fields.map((field) => [
        field.property,
        fromBson(document[field.name]),
      ]),
    );

  /** Record keyed by property → document; `_id` is left to the database unless given. */
  const toDocument = (model: ModelDefinition, input: DatabaseRecord) => {
    const document: DatabaseRecord = {};
    for (const field of model.fields) {
      const value = input[field.property];
      if (value === undefined) continue;
      const collectionName = dbRefOf(model, field);
      const toBson = (id: unknown) =>
        collectionName
          ? new DBRef(collectionName, toId(id) as ObjectId)
          : toId(id);
      document[field.name] =
        field.type !== 'ID' || value === null
          ? value
          : Array.isArray(value)
            ? value.map(toBson)
            : toBson(value);
    }
    return document;
  };

  /** MongoDB query of a filter, its relation filters read first. */
  async function filterOf(
    model: ModelDefinition,
    where: Where | null | undefined,
  ): Promise<Filter<Document>> {
    const resolved = await resolveRelationFilters(
      where,
      model,
      models,
      async (target, related, property) => {
        const field = target.fields.find(
          (candidate) => candidate.property === property,
        ) as FieldDefinition;
        return collection(target).distinct(
          pathOf(target)(field),
          await filterOf(target, related),
          options,
        );
      },
    );
    return mongoFilter(resolved, model, toId, pathOf(model));
  }

  // `_id` may be an ObjectId or, for documents inserted with their own id, anything else.
  const byKey = (key: DatabaseRecord) =>
    ({ _id: toId(key.id) }) as Filter<Document>;
  const findOne = async (model: ModelDefinition, key: DatabaseRecord) => {
    const document = await collection(model).findOne(byKey(key), options);
    return document && toRecord(model, document);
  };

  const insert = async (model: ModelDefinition, input: DatabaseRecord) => {
    const { insertedId } = await collection(model).insertOne(
      toDocument(model, input),
      options,
    );
    return (await findOne(model, { id: insertedId.toHexString() })) ?? input;
  };

  const connection: DatabaseConnection = {
    models,
    nullsFirst: true,
    async find(model, { where, orderBy, limit, offset }) {
      const sort = (orderBy ?? []).flatMap((entry) =>
        Object.entries(entry).map(([property, direction]): [string, 1 | -1] => {
          const field = model.fields.find(
            (candidate) => candidate.property === property,
          );
          return [
            field ? pathOf(model)(field) : property,
            direction === 'DESC' ? -1 : 1,
          ];
        }),
      );
      let cursor = collection(model)
        .find(await filterOf(model, where), options)
        .sort(sort);
      if (offset) cursor = cursor.skip(offset);
      if (limit !== undefined && limit !== null) cursor = cursor.limit(limit);
      const documents = await cursor.toArray();
      return documents.map((document) => toRecord(model, document));
    },
    count: async (model, where) =>
      collection(model).countDocuments(await filterOf(model, where), options),
    findOne,
    insert,
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
    async upsert(model, input) {
      if (input.id === undefined || input.id === null) {
        return insert(model, input);
      }
      const changes = toDocument(model, input);
      delete changes._id;
      await collection(model).updateOne(
        byKey(input),
        Object.keys(changes).length > 0
          ? { $set: changes }
          : { $setOnInsert: { _id: toId(input.id) } },
        { upsert: true, session },
      );
      return (await findOne(model, input)) as DatabaseRecord;
    },
    async insertMany(model, inputs) {
      if (inputs.length === 0) return 0;
      const { insertedCount } = await collection(model).insertMany(
        inputs.map((input) => toDocument(model, input)),
        options,
      );
      return insertedCount;
    },
    async deleteMany(model, where) {
      const { deletedCount } = await collection(model).deleteMany(
        await filterOf(model, where),
        options,
      );
      return deletedCount;
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

    const { models, dbRefs } = await readModels(db, options.naming).catch(
      async (error) => {
        await client.close();
        throw error;
      },
    );
    addRelations(inferForeignKeys(models, dbRefs));

    return connectionOver({
      mongo,
      client,
      db,
      models,
      dbRefs,
      transactions: await supportsTransactions(db),
    });
  },
};
