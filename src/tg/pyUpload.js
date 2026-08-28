// Client for the local Telethon upload microservice (see pyservice/).
// Uploads go through it when it is healthy; every failure falls back to the
// in-process GramJS path so uploads never depend on the extra service.

import { config } from "../config.js";

let healthCache = { at: 0, ok: false };
const HEALTH_TTL = 15_000;

function headers(extra = {}) {
  return {
    "Content-Type": "application/json",
    ...(config.uploadService.token ? { "X-Upload-Token": config.uploadService.token } : {}),
    ...extra,
  };
}

export async function pyServiceHealthy() {
  if (!config.uploadService.enabled) return false;
  const now = Date.now();
  if (now - healthCache.at < HEALTH_TTL) return healthCache.ok;
  let ok = false;
  try {
    const res = await fetch(`${config.uploadService.url}/health`, {
      headers: headers(),
      signal: AbortSignal.timeout(2000),
    });
    ok = res.ok;
    if (ok) {
      const body = await res.json().catch(() => ({}));
      if (body && body.cryptg === false) console.warn("[pyupload] service running without cryptg — install it for full speed");
    }
  } catch {
    ok = false;
  }
  healthCache = { at: now, ok };
  return ok;
}

export function invalidatePyHealth() {
  healthCache = { at: 0, ok: false };
}

export async function cancelPyUpload(job) {
  if (!job || !config.uploadService.enabled) return;
  try {
    await fetch(`${config.uploadService.url}/cancel/${encodeURIComponent(job)}`, {
      method: "POST",
      headers: headers(),
      signal: AbortSignal.timeout(3000),
    });
  } catch {}
}

export class PyUploadUnavailable extends Error {}

/**
 * Upload one on-disk file through the Telethon service.
 * Resolves with { id } (the Telegram message id).
 * Throws PyUploadUnavailable when the service could not take the job at all —
 * callers should then retry with GramJS.
 */
export async function pyUploadFile({ job, accountId, account, peer, filePath, fileName, fileSize, caption, forceDocument, thumb, onProgress }) {
  let res;
  try {
    res = await fetch(`${config.uploadService.url}/upload`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        job: job || null,
        account_id: String(accountId),
        api_id: Number(account.api_id),
        api_hash: String(account.api_hash),
        session: String(account.session),
        peer: typeof peer === "string" ? JSON.parse(peer) : peer,
        path: filePath,
        name: fileName,
        size: Number(fileSize) || 0,
        caption: caption || "",
        force_document: !!forceDocument,
        thumb: thumb || null,
      }),
    });
  } catch (e) {
    invalidatePyHealth();
    throw new PyUploadUnavailable(`upload service unreachable: ${e?.message || e}`);
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    invalidatePyHealth();
    throw new PyUploadUnavailable(`upload service error ${res.status}: ${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result = null;
  let error = null;
  let sawProgress = false;

  const handle = (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.error) {
      error = new Error(msg.error);
      error.cancelled = !!msg.cancelled;
      return;
    }
    if (msg.done) {
      result = { id: Number(msg.msg_id) };
      return;
    }
    if (typeof msg.sent === "number") {
      sawProgress = true;
      if (onProgress) onProgress(msg.sent, msg.total || Number(fileSize) || 0);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) handle(line);
  }
  if (buf) handle(buf);

  if (result) return result;
  if (error) {
    // Nothing was transferred yet → treat as "service could not do it" so the
    // GramJS fallback can take over cleanly. Otherwise it is a real failure.
    if (!sawProgress && !error.cancelled) throw new PyUploadUnavailable(error.message);
    throw error;
  }
  throw new PyUploadUnavailable("upload service closed the stream without a result");
}
