/**
 * MongoDB-backed storage that exposes the exact same synchronous API as the
 * legacy SQLite layer (`stmt.<query>.get/all/run`, `metaGet`, `metaSet`).
 *
 * Every collection is small (users, accounts, folders, shares, keys, sessions,
 * multipart entries and upload history), so the whole dataset is mirrored in
 * memory at boot and every mutation is written through to MongoDB Atlas. This
 * keeps all existing routes untouched while making state survive restarts and
 * redeploys on Render.
 */
import { connectMongo, getDb, COLLECTIONS } from "../mongodb.js";

const cache = {
  meta: new Map(), // k -> v
  accounts: new Map(),
  folders: new Map(),
  shares: new Map(),
  api_keys: new Map(),
  users: new Map(),
  sessions: new Map(), // sid -> row
  multipart_files: new Map(),
  upload_jobs: new Map(),
};

/* ---------------- write-through queue ---------------- */

let queue = Promise.resolve();
let pending = 0;

function enqueue(fn) {
  pending++;
  queue = queue
    .then(fn)
    .catch((e) => console.error("[mongo] write failed:", e?.message || e))
    .finally(() => {
      pending--;
    });
  return queue;
}

export function flushWrites() {
  return queue;
}

export function pendingWrites() {
  return pending;
}

function col(name) {
  return getDb().collection(name);
}

function save(name, id, doc) {
  enqueue(() => col(name).replaceOne({ _id: id }, { _id: id, ...doc }, { upsert: true }));
}

function remove(name, ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return;
  enqueue(() => col(name).deleteMany({ _id: { $in: list } }));
}

function strip(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

function clone(row) {
  return row ? { ...row } : undefined;
}

function ciCompare(a, b) {
  return String(a || "").toLowerCase().localeCompare(String(b || "").toLowerCase());
}

/* ---------------- boot ---------------- */

export async function initMongoStore() {
  await connectMongo();
  const db = getDb();

  const load = async (name, key, target) => {
    const docs = await db.collection(name).find({}).toArray();
    target.clear();
    for (const d of docs) target.set(String(d[key] ?? d._id), strip(d));
  };

  const metaDocs = await db.collection(COLLECTIONS.meta).find({}).toArray();
  cache.meta.clear();
  for (const d of metaDocs) cache.meta.set(String(d._id), String(d.v));

  await Promise.all([
    load(COLLECTIONS.accounts, "id", cache.accounts),
    load(COLLECTIONS.folders, "id", cache.folders),
    load(COLLECTIONS.shares, "id", cache.shares),
    load(COLLECTIONS.api_keys, "id", cache.api_keys),
    load(COLLECTIONS.users, "id", cache.users),
    load(COLLECTIONS.sessions, "sid", cache.sessions),
    load(COLLECTIONS.multipart_files, "id", cache.multipart_files),
    load(COLLECTIONS.upload_jobs, "id", cache.upload_jobs),
  ]);

  console.log(
    `[mongo] loaded users=${cache.users.size} accounts=${cache.accounts.size} folders=${cache.folders.size} ` +
      `shares=${cache.shares.size} sessions=${cache.sessions.size} uploads=${cache.upload_jobs.size}`
  );
}

/* ---------------- meta ---------------- */

export function metaGet(k, dflt = null) {
  return cache.meta.has(k) ? cache.meta.get(k) : dflt;
}

export function metaSet(k, v) {
  const value = String(v);
  cache.meta.set(k, value);
  save(COLLECTIONS.meta, k, { v: value });
}

/* ---------------- cascades ---------------- */

function deleteByPredicate(name, map, predicate, key = "id") {
  const removed = [];
  for (const [id, row] of map) {
    if (predicate(row)) {
      map.delete(id);
      removed.push(row[key] ?? id);
    }
  }
  remove(name, removed);
  return removed.length;
}

function cascadeAccount(accountId) {
  deleteByPredicate(COLLECTIONS.folders, cache.folders, (r) => r.account_id === accountId);
  deleteByPredicate(COLLECTIONS.shares, cache.shares, (r) => r.account_id === accountId);
  deleteByPredicate(COLLECTIONS.api_keys, cache.api_keys, (r) => r.account_id === accountId);
  deleteByPredicate(COLLECTIONS.multipart_files, cache.multipart_files, (r) => r.account_id === accountId);
  deleteByPredicate(COLLECTIONS.upload_jobs, cache.upload_jobs, (r) => r.account_id === accountId);
}

function cascadeUser(userId) {
  deleteByPredicate(COLLECTIONS.sessions, cache.sessions, (r) => r.user_id === userId, "sid");
  deleteByPredicate(COLLECTIONS.upload_jobs, cache.upload_jobs, (r) => r.user_id === userId);
}

/* ---------------- statement shims ---------------- */

const q = (impl) => impl;

export const stmt = {
  /* accounts */
  addAccount: q({
    run(a) {
      const row = {
        id: a.id,
        label: a.label,
        phone: a.phone ?? null,
        user_id: a.user_id ?? null,
        username: a.username ?? null,
        api_id: Number(a.api_id),
        api_hash: a.api_hash,
        session: a.session,
        is_premium: a.is_premium ? 1 : 0,
        created_at: a.created_at,
        last_used_at: a.last_used_at,
      };
      cache.accounts.set(row.id, row);
      save(COLLECTIONS.accounts, row.id, row);
      return { changes: 1 };
    },
  }),
  listAccounts: q({
    all() {
      return [...cache.accounts.values()].sort((a, b) => b.last_used_at - a.last_used_at).map(clone);
    },
  }),
  getAccount: q({
    get(id) {
      return clone(cache.accounts.get(String(id)));
    },
  }),
  touchAccount: q({
    run(ts, id) {
      const row = cache.accounts.get(String(id));
      if (!row) return { changes: 0 };
      row.last_used_at = ts;
      save(COLLECTIONS.accounts, row.id, row);
      return { changes: 1 };
    },
  }),
  updateAccount: q({
    run(a) {
      const row = cache.accounts.get(String(a.id));
      if (!row) return { changes: 0 };
      Object.assign(row, {
        session: a.session,
        is_premium: a.is_premium ? 1 : 0,
        label: a.label,
        user_id: a.user_id ?? null,
        username: a.username ?? null,
      });
      save(COLLECTIONS.accounts, row.id, row);
      return { changes: 1 };
    },
  }),
  deleteAccount: q({
    run(id) {
      const key = String(id);
      if (!cache.accounts.delete(key)) return { changes: 0 };
      remove(COLLECTIONS.accounts, key);
      cascadeAccount(key);
      return { changes: 1 };
    },
  }),

  /* folders */
  addFolder: q({
    run(f) {
      const row = {
        id: f.id,
        account_id: f.account_id,
        parent_id: f.parent_id ?? null,
        title: f.title,
        peer_json: f.peer_json,
        kind: f.kind,
        created_at: f.created_at,
      };
      cache.folders.set(row.id, row);
      save(COLLECTIONS.folders, row.id, row);
      return { changes: 1 };
    },
  }),
  foldersFor: q({
    all(accountId) {
      return [...cache.folders.values()]
        .filter((f) => f.account_id === accountId)
        .sort((a, b) => String(b.kind).localeCompare(String(a.kind)) || ciCompare(a.title, b.title))
        .map(clone);
    },
  }),
  getFolder: q({
    get(id, accountId) {
      const row = cache.folders.get(String(id));
      return row && row.account_id === accountId ? clone(row) : undefined;
    },
  }),
  deleteFolder: q({
    run(id, accountId) {
      const row = cache.folders.get(String(id));
      if (!row || row.account_id !== accountId) return { changes: 0 };
      cache.folders.delete(String(id));
      remove(COLLECTIONS.folders, String(id));
      return { changes: 1 };
    },
  }),

  /* shares */
  addShare: q({
    run(s) {
      const row = {
        id: s.id,
        account_id: s.account_id,
        peer_json: s.peer_json,
        msg_id: s.msg_id ?? null,
        multipart_id: s.multipart_id ?? null,
        name: s.name ?? null,
        mime: s.mime ?? null,
        size: s.size ?? null,
        password_hash: s.password_hash ?? null,
        expires_at: s.expires_at ?? null,
        downloads: 0,
        created_at: s.created_at,
        kind: s.kind || "file",
      };
      cache.shares.set(row.id, row);
      save(COLLECTIONS.shares, row.id, row);
      return { changes: 1 };
    },
  }),
  getShare: q({
    get(id) {
      return clone(cache.shares.get(String(id)));
    },
  }),
  getShareByFile: q({
    get(accountId, peerJson, msgId) {
      return latest((s) => s.account_id === accountId && s.peer_json === peerJson && Number(s.msg_id) === Number(msgId));
    },
  }),
  deleteSharesByFile: q({
    run(accountId, peerJson, msgId) {
      const changes = deleteByPredicate(
        COLLECTIONS.shares,
        cache.shares,
        (s) => s.account_id === accountId && s.peer_json === peerJson && Number(s.msg_id) === Number(msgId)
      );
      return { changes };
    },
  }),
  deleteFolderShares: q({
    run(accountId, peerJson) {
      const changes = deleteByPredicate(
        COLLECTIONS.shares,
        cache.shares,
        (s) => s.account_id === accountId && s.peer_json === peerJson && s.kind === "folder"
      );
      return { changes };
    },
  }),
  getFolderShare: q({
    get(accountId, peerJson) {
      return latest((s) => s.account_id === accountId && s.peer_json === peerJson && s.kind === "folder");
    },
  }),
  incShareDownload: q({
    run(id) {
      const row = cache.shares.get(String(id));
      if (!row) return { changes: 0 };
      row.downloads = Number(row.downloads || 0) + 1;
      save(COLLECTIONS.shares, row.id, row);
      return { changes: 1 };
    },
  }),
  listShares: q({
    all() {
      return [...cache.shares.values()].sort((a, b) => b.created_at - a.created_at).map(clone);
    },
  }),
  deleteShare: q({
    run(id) {
      const key = String(id);
      if (!cache.shares.delete(key)) return { changes: 0 };
      remove(COLLECTIONS.shares, key);
      return { changes: 1 };
    },
  }),
  getShareByMultipart: q({
    get(accountId, peerJson, multipartId) {
      return latest(
        (s) => s.account_id === accountId && s.peer_json === peerJson && String(s.multipart_id) === String(multipartId)
      );
    },
  }),
  deleteSharesByMultipart: q({
    run(multipartId) {
      const changes = deleteByPredicate(
        COLLECTIONS.shares,
        cache.shares,
        (s) => String(s.multipart_id) === String(multipartId)
      );
      return { changes };
    },
  }),

  /* api keys */
  addApiKey: q({
    run(k) {
      for (const row of cache.api_keys.values()) {
        if (row.token_hash === k.token_hash) throw new Error("UNIQUE constraint failed: api_keys.token_hash");
      }
      const row = {
        id: k.id,
        token_hash: k.token_hash,
        label: k.label ?? null,
        account_id: k.account_id,
        created_at: k.created_at,
      };
      cache.api_keys.set(row.id, row);
      save(COLLECTIONS.api_keys, row.id, row);
      return { changes: 1 };
    },
  }),
  listApiKeys: q({
    all() {
      return [...cache.api_keys.values()]
        .sort((a, b) => b.created_at - a.created_at)
        .map(({ id, label, account_id, created_at }) => ({ id, label, account_id, created_at }));
    },
  }),
  findApiKeyByHash: q({
    get(hash) {
      for (const row of cache.api_keys.values()) {
        if (row.token_hash === hash) return { id: row.id, account_id: row.account_id };
      }
      return undefined;
    },
  }),
  deleteApiKey: q({
    run(id) {
      const key = String(id);
      if (!cache.api_keys.delete(key)) return { changes: 0 };
      remove(COLLECTIONS.api_keys, key);
      return { changes: 1 };
    },
  }),

  /* users */
  addUser: q({
    run(u) {
      const username = String(u.username);
      for (const row of cache.users.values()) {
        if (row.username === username) throw new Error("UNIQUE constraint failed: users.username");
      }
      const row = {
        id: u.id,
        username,
        password_hash: u.password_hash,
        role: u.role || "user",
        created_at: u.created_at,
      };
      cache.users.set(row.id, row);
      save(COLLECTIONS.users, row.id, row);
      return { changes: 1 };
    },
  }),
  getUserByUsername: q({
    get(username) {
      for (const row of cache.users.values()) if (row.username === username) return clone(row);
      return undefined;
    },
  }),
  getUserById: q({
    get(id) {
      return clone(cache.users.get(String(id)));
    },
  }),
  listUsers: q({
    all() {
      return [...cache.users.values()]
        .sort((a, b) => a.created_at - b.created_at)
        .map(({ id, username, role, created_at }) => ({ id, username, role, created_at }));
    },
  }),
  updateUser: q({
    run(u) {
      const row = cache.users.get(String(u.id));
      if (!row) return { changes: 0 };
      row.password_hash = u.password_hash;
      row.role = u.role;
      save(COLLECTIONS.users, row.id, row);
      return { changes: 1 };
    },
  }),
  deleteUser: q({
    run(id) {
      const key = String(id);
      if (!cache.users.delete(key)) return { changes: 0 };
      remove(COLLECTIONS.users, key);
      cascadeUser(key);
      return { changes: 1 };
    },
  }),
  countUsers: q({
    get() {
      return { c: cache.users.size };
    },
  }),

  /* multipart files */
  addMultipart: q({
    run(m) {
      const row = {
        id: m.id,
        account_id: m.account_id,
        peer_json: m.peer_json,
        name: m.name,
        mime: m.mime ?? null,
        size: m.size,
        parts_json: m.parts_json,
        created_at: m.created_at,
      };
      cache.multipart_files.set(row.id, row);
      save(COLLECTIONS.multipart_files, row.id, row);
      return { changes: 1 };
    },
  }),
  getMultipart: q({
    get(id) {
      return clone(cache.multipart_files.get(String(id)));
    },
  }),
  listMultipart: q({
    all(accountId, peerJson) {
      return [...cache.multipart_files.values()]
        .filter((m) => m.account_id === accountId && m.peer_json === peerJson)
        .sort((a, b) => b.created_at - a.created_at)
        .map(clone);
    },
  }),
  renameMultipart: q({
    run(m) {
      const row = cache.multipart_files.get(String(m.id));
      if (!row) return { changes: 0 };
      row.name = m.name;
      save(COLLECTIONS.multipart_files, row.id, row);
      return { changes: 1 };
    },
  }),
  updateMultipartParts: q({
    run(m) {
      const row = cache.multipart_files.get(String(m.id));
      if (!row) return { changes: 0 };
      row.parts_json = m.parts_json;
      save(COLLECTIONS.multipart_files, row.id, row);
      return { changes: 1 };
    },
  }),
  deleteMultipart: q({
    run(id) {
      const key = String(id);
      if (!cache.multipart_files.delete(key)) return { changes: 0 };
      remove(COLLECTIONS.multipart_files, key);
      return { changes: 1 };
    },
  }),

  /* sessions */
  addSession: q({
    run(s) {
      const row = {
        sid: s.sid,
        user_id: s.user_id,
        username: s.username,
        role: s.role,
        current_account_id: s.current_account_id ?? null,
        created_at: s.created_at,
        expires_at: s.expires_at,
      };
      cache.sessions.set(row.sid, row);
      save(COLLECTIONS.sessions, row.sid, row);
      return { changes: 1 };
    },
  }),
  getSession: q({
    get(sid) {
      return clone(cache.sessions.get(String(sid)));
    },
  }),
  updateSessionRow: q({
    run(s) {
      const row = cache.sessions.get(String(s.sid));
      if (!row) return { changes: 0 };
      row.current_account_id = s.current_account_id ?? null;
      save(COLLECTIONS.sessions, row.sid, row);
      return { changes: 1 };
    },
  }),
  deleteSession: q({
    run(sid) {
      const key = String(sid);
      if (!cache.sessions.delete(key)) return { changes: 0 };
      remove(COLLECTIONS.sessions, key);
      return { changes: 1 };
    },
  }),
  deleteExpiredSessions: q({
    run(now) {
      const changes = deleteByPredicate(COLLECTIONS.sessions, cache.sessions, (s) => s.expires_at < now, "sid");
      return { changes };
    },
  }),
  deleteSessionsByUser: q({
    run(userId) {
      const changes = deleteByPredicate(COLLECTIONS.sessions, cache.sessions, (s) => s.user_id === userId, "sid");
      return { changes };
    },
  }),

  /* upload jobs */
  upsertUploadJob: q({
    run(j) {
      const existing = cache.upload_jobs.get(String(j.id));
      const row = existing
        ? {
            ...existing,
            phase: j.phase,
            state_json: j.state_json,
            size: j.size,
            updated_at: j.updated_at,
            finished_at: j.finished_at ?? null,
          }
        : {
            id: j.id,
            user_id: j.user_id,
            account_id: j.account_id,
            folder_id: j.folder_id ?? null,
            name: j.name,
            size: j.size ?? 0,
            phase: j.phase || "queued",
            state_json: j.state_json || "{}",
            created_at: j.created_at,
            updated_at: j.updated_at,
            finished_at: j.finished_at ?? null,
          };
      cache.upload_jobs.set(row.id, row);
      save(COLLECTIONS.upload_jobs, row.id, row);
      return { changes: 1 };
    },
  }),
  getUploadJobAny: q({
    get(id) {
      const row = cache.upload_jobs.get(String(id));
      return row ? { id: row.id, user_id: row.user_id } : undefined;
    },
  }),
  getUploadJob: q({
    get(id, userId) {
      const row = cache.upload_jobs.get(String(id));
      return row && row.user_id === userId ? clone(row) : undefined;
    },
  }),
  listUploadJobs: q({
    all(userId, accountId, limit) {
      return [...cache.upload_jobs.values()]
        .filter((j) => j.user_id === userId && j.account_id === accountId)
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, Number(limit) || 50)
        .map(clone);
    },
  }),
  deleteOldUploadJobs: q({
    run(cutoff) {
      const changes = deleteByPredicate(
        COLLECTIONS.upload_jobs,
        cache.upload_jobs,
        (j) => j.finished_at != null && j.finished_at < cutoff
      );
      return { changes };
    },
  }),
};

function latest(predicate) {
  let best = null;
  for (const s of cache.shares.values()) {
    if (predicate(s) && (!best || s.created_at > best.created_at)) best = s;
  }
  return clone(best) || undefined;
}

/**
 * Legacy single-admin upgrade path, mirrored from the SQLite layer.
 */
export function seedLegacyAdmin(hashPassword, uid) {
  if (cache.users.size > 0) return;
  const legacy = metaGet("admin_password");
  if (legacy) {
    stmt.addUser.run({ id: uid(), username: "admin", password_hash: legacy, role: "admin", created_at: Date.now() });
  }
}
