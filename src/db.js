/**
 * Storage entrypoint.
 *
 * - When MONGODB_URI is set (production / Render), all state lives in MongoDB
 *   Atlas: admin users, login sessions, Telegram sessions, folders, share
 *   links, API keys, multipart files and upload history. Everything survives
 *   restarts and redeploys.
 * - Otherwise the legacy local SQLite file is used (handy for local dev and for
 *   running the migration script).
 *
 * Both engines expose the identical synchronous `stmt` / `metaGet` / `metaSet`
 * API, so routes are engine agnostic.
 */
import { isMongoEnabled } from "./mongodb.js";

let impl;
export let engine;

if (isMongoEnabled()) {
  const mongo = await import("./store/mongoStore.js");
  await mongo.initMongoStore();
  const { hashPassword, uid } = await import("./util.js");
  mongo.seedLegacyAdmin(hashPassword, uid);
  impl = mongo;
  engine = "mongodb";
} else {
  impl = await import("./store/sqliteStore.js");
  engine = "sqlite";
  console.log("[db] MONGODB_URI not set — using local SQLite storage");
}

export const stmt = impl.stmt;
export const metaGet = impl.metaGet;
export const metaSet = impl.metaSet;
export const flushWrites = impl.flushWrites || (async () => {});
export default impl.default ?? impl;
