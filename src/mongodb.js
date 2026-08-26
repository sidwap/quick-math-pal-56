import "dotenv/config";
import { MongoClient } from "mongodb";

export const MONGODB_URI = String(process.env.MONGODB_URI || "").trim();
export const MONGODB_DB = String(process.env.MONGODB_DB || "tgdrive").trim();

export function isMongoEnabled() {
  return MONGODB_URI.length > 0;
}

let client = null;
let database = null;
let connecting = null;

function errorText(error) {
  const parts = [];
  let current = error;
  while (current && parts.length < 5) {
    if (current.message) parts.push(String(current.message));
    current = current.cause;
  }
  return parts.join(" ");
}

function mongoConnectionError(error) {
  const message = errorText(error);
  const isTlsRejection =
    /TLSV1_ALERT_INTERNAL_ERROR|tlsv1 alert internal error|ERR_SSL_/i.test(message);

  if (isTlsRejection) {
    const wrapped = new Error(
      "MongoDB Atlas rejected the TLS connection. In Atlas, confirm the cluster is active and add Render's outbound IP ranges under Security > Network Access (or temporarily allow 0.0.0.0/0), then redeploy. Also use the Atlas-generated mongodb+srv:// connection string."
    );
    wrapped.cause = error;
    return wrapped;
  }

  return error;
}

/**
 * Connect to MongoDB Atlas (idempotent). Returns the Db handle.
 */
export async function connectMongo(uri = MONGODB_URI, dbName = MONGODB_DB) {
  if (database) return database;
  if (connecting) return connecting;
  if (!uri) throw new Error("MONGODB_URI is not set");

  connecting = (async () => {
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 20000,
      retryWrites: true,
      appName: "tgdrive-web",
    });
    await client.connect();
    database = client.db(dbName);
    await database.command({ ping: 1 });
    await ensureIndexes(database);
    console.log(`[mongo] connected to database "${dbName}"`);
    return database;
  })();

  try {
    return await connecting;
  } catch (e) {
    const failedClient = client;
    client = null;
    database = null;
    await failedClient?.close().catch(() => {});
    throw mongoConnectionError(e);
  } finally {
    connecting = null;
  }
}

export function getDb() {
  if (!database) throw new Error("MongoDB is not connected yet — call connectMongo() first");
  return database;
}

export function getClient() {
  return client;
}

export async function closeMongo() {
  if (client) {
    const c = client;
    client = null;
    database = null;
    await c.close().catch(() => {});
  }
}

export const COLLECTIONS = {
  meta: "meta",
  accounts: "accounts",
  folders: "folders",
  shares: "shares",
  api_keys: "api_keys",
  users: "users",
  sessions: "sessions",
  multipart_files: "multipart_files",
  upload_jobs: "upload_jobs",
};

async function ensureIndexes(db) {
  await Promise.all([
    db.collection(COLLECTIONS.users).createIndex({ username: 1 }, { unique: true }),
    db.collection(COLLECTIONS.accounts).createIndex({ last_used_at: -1 }),
    db.collection(COLLECTIONS.folders).createIndex({ account_id: 1 }),
    db.collection(COLLECTIONS.shares).createIndex({ account_id: 1, created_at: -1 }),
    db.collection(COLLECTIONS.api_keys).createIndex({ token_hash: 1 }, { unique: true }),
    db.collection(COLLECTIONS.sessions).createIndex({ expires_at: 1 }),
    db.collection(COLLECTIONS.multipart_files).createIndex({ account_id: 1, peer_json: 1 }),
    db.collection(COLLECTIONS.upload_jobs).createIndex({ user_id: 1, account_id: 1, updated_at: -1 }),
  ]).catch((e) => console.error("[mongo] index setup warning:", e?.message || e));
}
