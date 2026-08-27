"""Convert a GramJS StringSession into a Telethon StringSession.

Both libraries persist the same material (dc_id, server address, port and the
256-byte auth key) but encode it differently:

  GramJS   : "1" + base64(dc[1] | addr_len[2] | addr[n ascii] | port[2] | key[256])
  Telethon : "1" + base64url(dc[1] | ip[4 or 16] | port[2] | key[256])

The GramJS address is stored as text, so an IPv4 literal is repacked directly
and anything else (a hostname or IPv6 form) falls back to Telegram's canonical
production IP for that DC.
"""

import base64
import ipaddress
import struct

# Telegram production DC addresses, used when the GramJS session stored a
# hostname instead of a literal IP.
DC_IPV4 = {
    1: "149.154.175.53",
    2: "149.154.167.51",
    3: "149.154.175.100",
    4: "149.154.167.91",
    5: "91.108.56.130",
}


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.b64decode(value + padding)


def parse_gramjs_session(session: str):
    """Return (dc_id, ip, port, auth_key) from a GramJS StringSession string."""
    if not session or session[0] != "1":
        raise ValueError("Not a GramJS v1 string session")
    raw = _b64decode(session[1:])
    if len(raw) < 1 + 2 + 2 + 256:
        raise ValueError("String session too short")

    dc_id = raw[0]
    addr_len = struct.unpack(">h", raw[1:3])[0]
    if addr_len <= 0 or addr_len > 100:
        raise ValueError("Unsupported address encoding in session")
    address = raw[3 : 3 + addr_len].decode("utf-8", "ignore")
    offset = 3 + addr_len
    port = struct.unpack(">h", raw[offset : offset + 2])[0]
    key = raw[offset + 2 :]
    if len(key) != 256:
        raise ValueError(f"Unexpected auth key length: {len(key)}")

    try:
        ip = str(ipaddress.IPv4Address(address))
    except ValueError:
        ip = DC_IPV4.get(dc_id, DC_IPV4[2])

    return dc_id, ip, int(port), key


def gramjs_to_telethon(session: str) -> str:
    """Build a Telethon-compatible StringSession string."""
    dc_id, ip, port, key = parse_gramjs_session(session)
    # Telethon always talks to 443 over its default connection mode; the GramJS
    # session may hold a websocket port (80/443) which is not usable directly.
    if port not in (443, 80):
        port = 443
    packed = struct.pack(">B4sH256s", dc_id, ipaddress.IPv4Address(ip).packed, 443 if port == 80 else port, key)
    return "1" + base64.urlsafe_b64encode(packed).decode("ascii")


if __name__ == "__main__":  # pragma: no cover - manual smoke test
    import os

    demo_key = os.urandom(256)
    addr = b"149.154.167.51"
    blob = struct.pack(">B", 2) + struct.pack(">h", len(addr)) + addr + struct.pack(">h", 443) + demo_key
    gram = "1" + base64.b64encode(blob).decode()
    converted = gramjs_to_telethon(gram)
    dc, ip, port, key = parse_gramjs_session(gram)
    assert (dc, ip, port) == (2, "149.154.167.51", 443)
    assert key == demo_key
    assert converted.startswith("1")
    print("session conversion ok:", converted[:24], "...")
