# Telethon upload microservice

Localhost-only helper that performs Telegram uploads for the Node app. GramJS
tops out well under 1 MB/s; this service uses Telethon with several parallel
MTProto senders plus `cryptg` (native AES) and is typically many times faster.

It handles uploads only — login, listing, downloads, streaming and sharing all
stay in the Node app. If this service is stopped, uploads automatically fall
back to the old GramJS path.

## Setup

```bash
cd pyservice
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# same value as UPLOAD_SERVICE_TOKEN in the app's .env
export UPLOAD_SERVICE_TOKEN=$(openssl rand -hex 24)
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8765
```

With PM2, both processes start together:

```bash
UPLOAD_SERVICE_TOKEN=<same token> pm2 start ecosystem.config.cjs
```

## Endpoints

| Method | Path           | Purpose                                              |
| ------ | -------------- | ---------------------------------------------------- |
| GET    | `/health`      | `{ ok, cryptg, clients }` — used for the health probe |
| POST   | `/upload`      | Streams NDJSON progress, then `{ done, msg_id }`      |
| POST   | `/cancel/{job}`| Cancels an in-flight upload                           |

All requests require the `X-Upload-Token` header when a token is configured.

## Notes

- The Telegram session is reused from the Node app: the GramJS string session is
  converted in memory to a Telethon session (`session.py`). No extra login.
- File bytes are never sent over HTTP — the Node app writes the upload to disk
  and passes the path; both processes run on the same host.
- If `cryptg` cannot be built on the host, the service still works but logs a
  warning and runs slower.
