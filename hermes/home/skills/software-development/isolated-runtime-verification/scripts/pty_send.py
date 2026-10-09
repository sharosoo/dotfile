#!/usr/bin/env python3
"""Send escape-decoded bytes to a session of an isolated HTTP PTY server.

Usage: pty_send.py BASE_URL SESSION_ID PAYLOAD_FILE

PAYLOAD_FILE is UTF-8 text. These escape tokens are decoded before sending:
  \\xHH  \\NNN (octal)  \\n  \\r  \\t  \\\\
All other bytes are sent unchanged, so UTF-8 text needs no escaping.
The server must be an isolated test instance, never the production one.
"""
import json
import re
import sys
import urllib.request

SIMPLE = {"n": "\n", "r": "\r", "t": "\t", "\\": "\\"}


def _decode(match):
    token = match.group(1)
    if token[0] == "x":
        return chr(int(token[1:], 16))
    if token.isdigit():
        return chr(int(token, 8))
    return SIMPLE[token]


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    base, session_id, path = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(path, encoding="utf-8") as fh:
        raw = fh.read()
    data = re.sub(r"\\(x[0-9a-fA-F]{2}|[0-7]{3}|[nrt\\])", _decode, raw)
    body = json.dumps({"data": data}).encode("utf-8")
    req = urllib.request.Request(
        f"{base.rstrip('/')}/api/sessions/{session_id}/send",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(resp.status, resp.read().decode("utf-8", "replace")[:200])
    return 0


if __name__ == "__main__":
    sys.exit(main())
