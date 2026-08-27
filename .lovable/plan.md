# Faster Telegram uploads via a Python (Telethon) microservice

GramJS caps out around 800 KB/s because its MTProto upload path is single-connection-bound per worker and slow at crypto/chunking. Telethon (with `fast_download`/multi-DC connections) reliably reaches several MB/s on the same account. The plan adds a small local Python service that performs only the Telegram upload, keeps everything else (login, listing, downloads, streaming, sharing) in Node, and falls back to the existing GramJS path automatically when the service is unavailable.

## Architecture

```text
Browser ──▶ Node /api/files/upload ──▶ writes file to /tmp (unchanged)
                     │
                     ├─▶ POST http://127.0.0.1:8765/upload   (Telethon service)
                     │      body: {path, name, size, caption, peer, account}
                     │      response: streaming NDJSON progress, final {msg_id}
                     │
                     └─▶ on connect error / 5xx / timeout → GramJS uploadFile()
```

- The Python service runs on localhost only, is never exposed publicly, and requires a shared secret header (`X-Upload-Token`, new `UPLOAD_SERVICE_TOKEN` env var).
- File bytes are never sent over HTTP: Node already writes the upload to `/tmp`, and passes the path. Both processes run on the same host.
- Progress arrives as newline-delimited JSON lines (`{sent, total}`) that Node forwards into the existing `publish(job, {phase:"sending", ...})` stream, so the current upload UI (speed, bytes, %, cancel) keeps working with no frontend change.

## Session sharing (the tricky part)

Telethon and GramJS both store `dc_id + ip + port + auth_key`, but with different string encodings. The service will decode the GramJS `StringSession` (version byte `1`, base64 of dcId/ip/port/256-byte auth key) and rebuild a Telethon `StringSession` from those fields in memory. No re-login, no second session row, no user-visible change. If decoding fails for an account, that account silently uses GramJS.

## Work items

1. `pyservice/main.py` — FastAPI + Telethon + uvicorn service:
   - `POST /upload` (streamed NDJSON progress, `part_size_kb=512`, high `workers`), `POST /cancel/{job}`, `GET /health`.
   - LRU cache of connected Telethon clients per account, same as the Node manager.
   - Peer rebuilt from the same `peer_json` shape (`self` / `channel` / `user`).
2. `pyservice/session.py` — GramJS→Telethon session conversion + tests for a sample string.
3. `pyservice/requirements.txt` — `telethon`, `fastapi`, `uvicorn`, `cryptg` (cryptg is the single biggest speed factor: native AES).
4. `src/tg/pyUpload.js` — Node client: health probe (cached, short TTL), streamed progress parsing, cancel forwarding, typed errors.
5. `src/routes/files.js` — in `uploadHandler`, try `pyUpload` first for both the single-file and multipart-part paths; on service-unavailable or upload error, fall back to `uploadFile()` (GramJS) and log which path was used. Cancel is wired to the service.
6. `src/config.js` + `.env.example` — `UPLOAD_SERVICE_URL` (default `http://127.0.0.1:8765`), `UPLOAD_SERVICE_TOKEN`, `UPLOAD_SERVICE_ENABLED`.
7. `ecosystem.config.cjs` — second PM2 app running the Python service (`interpreter: python3`), plus setup notes in `INSTALL.md` (`python3 -m venv`, `pip install -r requirements.txt`).

## Verification

- `GET /health` check and an end-to-end upload of a large test file, comparing logged MB/s against the current GramJS numbers.
- Kill the Python service mid-run to confirm the fallback still completes the upload.
- Confirm progress, speed, cancel, and multipart splitting behave identically in the existing UI.

## Notes

- Downloads/streaming stay on GramJS, as requested.
- If the host has no `cryptg` build tooling, Telethon still works but gains less speed — the plan logs a warning at startup so this is visible.
