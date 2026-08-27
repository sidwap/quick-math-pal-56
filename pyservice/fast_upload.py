"""Parallel MTProto upload for Telethon.

Telethon's stock ``upload_file`` pushes every 512 KiB part through a single
connection, which is what caps throughput at well under 1 MB/s on long-haul
links. This module opens several exported senders to the account's own DC and
uploads parts concurrently, which is where the real speed-up comes from
(together with ``cryptg`` for native AES).

Falls back to the caller's normal path when anything here fails.
"""

import asyncio
import hashlib
import os
from typing import Callable, Optional

from telethon.tl.functions.upload import SaveBigFilePartRequest, SaveFilePartRequest
from telethon.tl.types import InputFileBig, InputFile

PART_SIZE = 512 * 1024
BIG_FILE_THRESHOLD = 10 * 1024 * 1024


def _worker_count(size: int) -> int:
    if size > 512 * 1024 * 1024:
        return 16
    if size > 128 * 1024 * 1024:
        return 12
    if size > 16 * 1024 * 1024:
        return 8
    return 4


async def parallel_upload(
    client,
    path: str,
    file_name: str,
    progress: Optional[Callable[[int, int], None]] = None,
    cancelled: Optional[Callable[[], bool]] = None,
):
    """Upload ``path`` and return an InputFile/InputFileBig ready for send_file."""
    size = os.path.getsize(path)
    total_parts = (size + PART_SIZE - 1) // PART_SIZE
    file_id = int.from_bytes(os.urandom(8), "little", signed=True)
    is_big = size > BIG_FILE_THRESHOLD

    sent = 0
    sent_lock = asyncio.Lock()
    md5 = hashlib.md5() if not is_big else None

    if not is_big:
        # Small files: single connection is fine and keeps the md5 requirement simple.
        with open(path, "rb") as fh:
            for part in range(total_parts):
                if cancelled and cancelled():
                    raise asyncio.CancelledError()
                chunk = fh.read(PART_SIZE)
                md5.update(chunk)
                await client(SaveFilePartRequest(file_id=file_id, file_part=part, bytes=chunk))
                sent += len(chunk)
                if progress:
                    progress(sent, size)
        return InputFile(id=file_id, parts=total_parts, name=file_name, md5_checksum=md5.hexdigest())

    workers = min(_worker_count(size), total_parts)
    dc_id = client.session.dc_id
    senders = []
    for _ in range(workers):
        try:
            senders.append(await client._borrow_exported_sender(dc_id))
        except Exception:
            break
    if not senders:
        senders = [None]  # fall back to the main connection

    next_part = 0
    part_lock = asyncio.Lock()

    async def run(sender):
        nonlocal next_part, sent
        loop = asyncio.get_event_loop()
        with open(path, "rb") as fh:
            while True:
                if cancelled and cancelled():
                    raise asyncio.CancelledError()
                async with part_lock:
                    part = next_part
                    next_part += 1
                if part >= total_parts:
                    return
                offset = part * PART_SIZE

                def read():
                    fh.seek(offset)
                    return fh.read(PART_SIZE)

                chunk = await loop.run_in_executor(None, read)
                if not chunk:
                    return
                req = SaveBigFilePartRequest(
                    file_id=file_id, file_part=part, file_total_parts=total_parts, bytes=chunk
                )
                if sender is None:
                    await client(req)
                else:
                    await sender.send(req)
                async with sent_lock:
                    sent += len(chunk)
                    if progress:
                        progress(min(sent, size), size)

    try:
        await asyncio.gather(*(run(s) for s in senders))
    finally:
        for s in senders:
            if s is not None:
                try:
                    await client._return_exported_sender(s)
                except Exception:
                    pass

    return InputFileBig(id=file_id, parts=total_parts, name=file_name)
