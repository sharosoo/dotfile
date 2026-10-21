#!/usr/bin/env python3
"""Control the local Windows VM without touching the host desktop."""
import argparse
import json
import pathlib
import socket
import time

ROOT = pathlib.Path(__file__).resolve().parent

class QMP:
    def __enter__(self):
        self.socket = socket.socket(socket.AF_UNIX)
        self.socket.settimeout(15)
        self.socket.connect(str(ROOT / "qmp.socket"))
        self.stream = self.socket.makefile("rwb")
        self.stream.readline()
        self.command("qmp_capabilities")
        return self

    def __exit__(self, *args):
        self.stream.close()
        self.socket.close()

    def command(self, name, **arguments):
        self.stream.write(json.dumps({"execute": name, "arguments": arguments}).encode() + b"\n")
        self.stream.flush()
        while True:
            line = self.stream.readline()
            if not line:
                raise RuntimeError("QMP connection closed")
            result = json.loads(line)
            if "error" in result:
                raise RuntimeError(result["error"])
            if "return" in result:
                return result["return"]

    def key(self, *keys):
        # Explicit releases prevent the next command from racing a deferred key-up timer.
        self.command("input-send-event", events=[
            {"type": "key", "data": {"down": True, "key": {"type": "qcode", "data": key}}}
            for key in keys
        ])
        time.sleep(0.1)
        self.command("input-send-event", events=[
            {"type": "key", "data": {"down": False, "key": {"type": "qcode", "data": key}}}
            for key in reversed(keys)
        ])
        time.sleep(0.1)

    def click(self, x, y, width, height):
        if not (0 <= x < width and 0 <= y < height):
            raise ValueError("Coordinates must be inside the full-resolution guest screen")
        self.command("input-send-event", events=[
            {"type": "abs", "data": {"axis": "x", "value": round(x * 32767 / (width - 1))}},
            {"type": "abs", "data": {"axis": "y", "value": round(y * 32767 / (height - 1))}},
        ])
        time.sleep(0.2)
        for down in (True, False):
            self.command("input-send-event", events=[{"type": "btn", "data": {"down": down, "button": "left"}}])
            time.sleep(0.15)

    def scroll(self, direction, steps):
        if not 1 <= steps <= 100:
            raise ValueError("Scroll steps must be between 1 and 100")
        for _ in range(steps):
            for down in (True, False):
                self.command("input-send-event", events=[{"type": "btn", "data": {"down": down, "button": "wheel-" + direction}}])
            time.sleep(0.1)

    def text(self, text):
        plain = dict(zip(" -_=+.,/;:'\"[]{}\\|`~!?@#$%^&*()<>\n\t", [
            "spc", "minus", ("shift", "minus"), "equal", ("shift", "equal"), "dot", "comma", "slash", "semicolon", ("shift", "semicolon"), "apostrophe", ("shift", "apostrophe"), "bracket_left", "bracket_right", ("shift", "bracket_left"), ("shift", "bracket_right"), "backslash", ("shift", "backslash"), "grave_accent", ("shift", "grave_accent"), ("shift", "1"), ("shift", "slash"), ("shift", "2"), ("shift", "3"), ("shift", "4"), ("shift", "5"), ("shift", "6"), ("shift", "7"), ("shift", "8"), ("shift", "9"), ("shift", "0"), ("shift", "comma"), ("shift", "dot"), "ret", "tab",
        ]))
        # Reject unsupported characters before sending a partial command.
        if any(not (c.isascii() and c.isalnum()) and c not in plain for c in text):
            raise ValueError("Only ASCII text supported; guest keyboard must use ABC/US layout")
        for c in text:
            if c.isascii() and c.isalnum():
                keys = ("shift", c.lower()) if c.isupper() else (c,)
            else:
                value = plain[c]
                keys = value if isinstance(value, tuple) else (value,)
            self.key(*keys)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    commands.add_parser("status")
    screenshot = commands.add_parser("shot")
    screenshot.add_argument("path")
    click = commands.add_parser("click")
    click.add_argument("x", type=int)
    click.add_argument("y", type=int)
    click.add_argument("--width", type=int, default=1280)
    click.add_argument("--height", type=int, default=800)
    key = commands.add_parser("key")
    key.add_argument("keys", nargs="+")
    scroll = commands.add_parser("scroll")
    scroll.add_argument("direction", choices=["up", "down"])
    scroll.add_argument("--steps", type=int, default=3)
    text = commands.add_parser("text")
    text.add_argument("value", nargs="?")
    text.add_argument("--file", type=pathlib.Path)
    commands.add_parser("powerdown")
    args = parser.parse_args()
    with QMP() as qmp:
        if args.action == "status":
            print(json.dumps(qmp.command("query-status")))
        elif args.action == "shot":
            target = pathlib.Path(args.path).resolve()
            if target.suffix.lower() != ".png":
                parser.error("Screenshot target must end in .png")
            qmp.command("screendump", filename=str(target), format="png")
            print(target)
        elif args.action == "click":
            qmp.click(args.x, args.y, args.width, args.height)
        elif args.action == "key":
            qmp.key(*args.keys)
        elif args.action == "scroll":
            qmp.scroll(args.direction, args.steps)
        elif args.action == "text":
            if (args.value is None) == (args.file is None):
                parser.error("Provide either text or --file")
            qmp.text(args.file.read_text().rstrip("\n") if args.file else args.value)
        elif args.action == "powerdown":
            qmp.command("system_powerdown")

if __name__ == "__main__":
    main()
