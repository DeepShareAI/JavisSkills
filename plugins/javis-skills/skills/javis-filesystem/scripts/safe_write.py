#!/usr/bin/env python3
"""Atomic text-file write with an extension allowlist.

Reads content from stdin. Writes to a temp sibling then os.replace()s.
Refuses any extension not in the allowlist and any path that resolves
outside JAVIS_FS_ROOT.

Usage:
    echo "content" | safe_write.py <path> [--create-parents]
"""
from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _lib

_WRITE_ALLOWLIST = {
    ".md", ".txt", ".tex", ".yaml", ".yml", ".json", ".bib", ".csv", ".html",
}


def run(argv: list[str], stdin_text: str | None = None) -> None:
    parser = argparse.ArgumentParser(prog="safe_write.py")
    parser.add_argument("path")
    parser.add_argument("--create-parents", action="store_true")
    args = parser.parse_args(argv)

    content = stdin_text if stdin_text is not None else sys.stdin.read()

    try:
        target = _lib.resolve_under_root(args.path)
    except _lib.TraversalError as e:
        _lib.emit_err(str(e), code=2)

    ext = target.suffix.lower()
    if ext not in _WRITE_ALLOWLIST:
        _lib.emit_err(
            f"refusing to write extension '{ext}'; allowlist is {sorted(_WRITE_ALLOWLIST)}",
            code=3,
        )

    parent = target.parent
    if not parent.exists():
        if args.create_parents:
            parent.mkdir(parents=True, exist_ok=True)
        else:
            _lib.emit_err(f"parent directory does not exist: '{parent}'", code=4)
    elif not parent.is_dir():
        _lib.emit_err(f"parent is not a directory: '{parent}'", code=5)

    token = secrets.token_hex(4)
    tmp = target.with_suffix(target.suffix + f".tmp.{os.getpid()}.{token}")
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, target)
    except Exception as e:
        try:
            tmp.unlink()
        except OSError:
            pass
        _lib.emit_err(f"write failed: {e}", code=6)

    root = _lib.get_root()
    _lib.emit_ok({
        "path": str(target.relative_to(root)),
        "bytes_written": len(content.encode("utf-8")),
    })


if __name__ == "__main__":
    run(sys.argv[1:])
