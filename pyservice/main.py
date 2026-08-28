"""Telethon upload microservice.

Listens on localhost only and performs one job: push an already-on-disk file to
Telegram as fast as possible, streaming progress back to the Node app as
newline-delimited JSON. Everything else (login, listing, downloads, streaming)
stays in the Node application.

Run:  uvicorn main:app --host 127.0.0.1 --port 8765
"""

import asyncio
import json
import logging
import os
import time
from typing import Dict, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import InputPeerSelf, InputPeerChannel, InputPeerUser

from fast_upload import parallel_upload
from session import gramjs_to_telethon

logging.basicConfig(level=logging.INFO, format="[pyupload] %(levelname)s %(message)s")
log = logging.getLogger("pyupload")

TOKEN = os.environ.get("UPLOAD_SERVICE_TOKEN", "")
CLIENT_IDLE_SECONDS = 15 * 60

try:
    import cryptg  # noqa: F401

    HAS_CRYPTG = True
except Exception:  # pragma: no cover
    HAS_CRYPTG = False
    log.warning("cryptg is not installed — uploads will be noticeably slower (pip install cryptg)")

app = FastAPI(title="tgdrive upload service")

# account_id -> {"client": TelegramClient, "used": ts}
_clients: Dict[str, dict] = {}
_client_lock = asyncio.Lock()
# job id -> True when a cancel was requested
_cancelled: Dict[str, bool] = {}


class UploadRequest(BaseModel):
    job: Optional[str] = None
    account_id: str
    api_id: int
    api_hash: str
    session: str
    peer: dict
    path: str
    name: str
    size: int = 0
    caption: str = ""
    force_document: bool = True
    thumb: Optional[str] = None


def _check_token(token: Optional[str]):
    if TOKEN and token != TOKEN:
        raise HTTPException(status_code=401, detail="Bad upload token")


def build_peer(peer: dict):
    kind = peer.get("kind")
    if kind == "self":
        return InputPeerSelf()
    if kind == "channel":
        return InputPeerChannel(channel_id=int(peer["channelId"]), access_hash=int(peer["accessHash"]))
    if kind == "user":
        return InputPeerUser(user_id=int(peer["userId"]), access_hash=int(peer["accessHash"]))
    raise HTTPException(status_code=400, detail=f"Unsupported peer kind: {kind}")


async def get_client(req: UploadRequest) -> TelegramClient:
    async with _client_lock:
        entry = _clients.get(req.account_id)
        if entry and entry["client"].is_connected():
            entry["used"] = time.time()
            return entry["client"]

        telethon_session = gramjs_to_telethon(req.session)
        client = TelegramClient(
            StringSession(telethon_session),
            req.api_id,
            req.api_hash,
            connection_retries=3,
            retry_delay=1,
            auto_reconnect=True,
        )
        await client.connect()
        if not await client.is_user_authorized():
            try:
                await client.disconnect()
            except Exception:
                pass
            raise HTTPException(status_code=401, detail="Telethon session not authorized")
        _clients[req.account_id] = {"client": client, "used": time.time()}
        await _sweep_clients()
        return client


async def _sweep_clients():
    now = time.time()
    for account_id, entry in list(_clients.items()):
        if now - entry["used"] > CLIENT_IDLE_SECONDS:
            _clients.pop(account_id, None)
            try:
                await entry["client"].disconnect()
            except Exception:
                pass


@app.get("/health")
async def health():
    return {"ok": True, "cryptg": HAS_CRYPTG, "clients": len(_clients)}


@app.post("/cancel/{job}")
async def cancel(job: str, x_upload_token: Optional[str] = Header(default=None)):
    _check_token(x_upload_token)
    _cancelled[job] = True
    return {"ok": True}


@app.post("/upload")
async def upload(body: UploadRequest, request: Request, x_upload_token: Optional[str] = Header(default=None)):
    _check_token(x_upload_token)
    if not os.path.exists(body.path):
        raise HTTPException(status_code=400, detail="File not found on disk")

    client = await get_client(body)
    peer = build_peer(body.peer)
    job = body.job or ""
    _cancelled.pop(job, None)

    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_event_loop()
    size = body.size or os.path.getsize(body.path)
    last_emit = {"at": 0.0}

    def on_progress(sent: int, total: int):
        now = time.time()
        # Throttle to ~10 updates/second; the UI smooths the rest.
        if now - last_emit["at"] < 0.1 and sent < total:
            return
        last_emit["at"] = now
        queue.put_nowait({"sent": int(sent), "total": int(total or size)})

    def is_cancelled():
        return bool(job and _cancelled.get(job))

    async def run_upload():
        try:
            input_file = await parallel_upload(
                client, body.path, body.name, progress=on_progress, cancelled=is_cancelled
            )
            msg = await client.send_file(
                peer,
                input_file,
                caption=body.caption or "",
                force_document=bool(body.force_document),
                supports_streaming=True,
                thumb=body.thumb if body.thumb and os.path.exists(body.thumb) else None,
            )
            queue.put_nowait({"done": True, "msg_id": int(msg.id)})
        except asyncio.CancelledError:
            queue.put_nowait({"error": "Cancelled", "cancelled": True})
        except Exception as exc:  # surface the real Telegram error to Node
            log.exception("upload failed")
            queue.put_nowait({"error": str(exc) or exc.__class__.__name__})
        finally:
            queue.put_nowait(None)
            _cancelled.pop(job, None)

    task = loop.create_task(run_upload())

    async def stream():
        started = time.time()
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield (json.dumps(item) + "\n").encode()
        finally:
            if not task.done():
                task.cancel()
            log.info("job %s finished in %.1fs", job or "-", time.time() - started)

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)
