#!/usr/bin/env node
/**
 * One-off migration: copy an existing local SQLite database into MongoDB Atlas.
 *
 *   MONGODB_URI="mongodb+srv://..." node scripts/migrate-sqlite-to-mongo.js [path/to/tgdrive.sqlite]
 *
 * Safe to re-run: documents are upserted by their primary key.
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { connectMongo, closeMongo, COLLECTIONS, isMongoEnabled } from "../src/mongodb.js";
import { DATA_DIR } from "../src/config.js";

const TABLES = [
  ["meta", COLLECTIONS.meta, "k"],
  ["accounts", COLLECTIONS.accounts, "id"],
  ["folders", COLLECTIONS.folders, "id"],
  ["shares", COLLECTIONS.shares, "id"],
  ["api_keys", COLLECTIONS.api_keys, "id"],
  ["users", COLLECTIONS.users, "id"],
  ["sessions", COLLECTIONS.sessions, "sid"],
  ["multipart_files", COLLECTIONS.multipart_files, "id"],
  ["upload_jobs", COLLECTIONS.upload_jobs, "id"],
];

async function main() {
  if (!isMongoEnabled()) {
    console.error("MONGODB_URI is not set. Export it before running the migration.");
    process.exit(1);
  }
  const file = process.argv[2] || path.join(DATA_DIR, "tgdrive.sqlite");
  if (!fs.existsSync(file)) {
    console.error(`SQLite database not found at ${file}`);
    process.exit(1);
  }

  const sqlite = new Database(file, { readonly: true });
  const db = await connectMongo();

  for (const [table, collection, key] of TABLES) {
    let rows = [];
    try {
      rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
    } catch {
      console.log(`- ${table}: table missing, skipped`);
      continue;
    }
    if (!rows.length) {
      console.log(`- ${table}: empty`);
      continue;
    }
    const ops = rows.map((row) => ({
      replaceOne: {
        filter: { _id: String(row[key]) },
        replacement: { _id: String(row[key]), ...row },
        upsert: true,
      },
    }));
    const res = await db.collection(collection).bulkWrite(ops, { ordered: false });
    console.log(`- ${table} -> ${collection}: ${res.upsertedCount + res.modifiedCount + res.matchedCount}/${rows.length}`);
  }

  sqlite.close();
  await closeMongo();
  console.log("Migration complete.");
}

main().catch(async (e) => {
  console.error("Migration failed:", e?.stack || e);
  await closeMongo();
  process.exit(1);
});
