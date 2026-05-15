#!/usr/bin/env python3
"""List paper-project sections under <subpath>/out/sections/, sorted by NN.

Usage:
    list_sections.py [<subpath>]

Outputs JSON: [{"n": int, "slug": str, "path": str}, ...]
Paths are relative to <subpath> (or to the root when subpath is ".").
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _lib


_SECTION_RE = re.compile(r"^(\d{2})-([a-z0-9-]+)\.md$")


def run(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="list_sections.py")
    parser.add_argument("subpath", nargs="?", default=".")
    args = parser.parse_args(argv)

    try:
        base = _lib.resolve_under_root(args.subpath)
    except _lib.TraversalError as e:
        _lib.emit_err(str(e), code=2)

    sections_dir = base / "out" / "sections"
    out: list[dict] = []
    if sections_dir.exists() and sections_dir.is_dir():
        for p in sections_dir.iterdir():
            if not p.is_file():
                continue
            m = _SECTION_RE.match(p.name)
            if not m:
                continue
            out.append({
                "n": int(m.group(1)),
                "slug": m.group(2),
                "path": str(p.relative_to(base)),
            })
    out.sort(key=lambda x: x["n"])
    _lib.emit_ok(out)


if __name__ == "__main__":
    run(sys.argv[1:])
