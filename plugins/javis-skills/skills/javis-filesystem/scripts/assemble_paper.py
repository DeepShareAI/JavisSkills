#!/usr/bin/env python3
"""Concatenate paper-project sections and write the result.

Usage:
    assemble_paper.py [<subpath>] [--output out/paper.md] [--separator "\\n\\n"]
"""
from __future__ import annotations

import argparse
import os
import re
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _lib


_SECTION_RE = re.compile(r"^(\d{2})-([a-z0-9-]+)\.md$")

_WRITE_ALLOWLIST = {
    ".md", ".txt", ".tex", ".yaml", ".yml", ".json", ".bib", ".csv", ".html",
}


def _list_sections(base: Path) -> list[Path]:
    sections_dir = base / "out" / "sections"
    if not sections_dir.exists() or not sections_dir.is_dir():
        return []
    matched: list[tuple[int, Path]] = []
    for p in sections_dir.iterdir():
        if p.is_symlink():
            # Reject symlinked sections — safety.md §1 requires resolution within root.
            continue
        if not p.is_file():
            continue
        m = _SECTION_RE.match(p.name)
        if not m:
            continue
        matched.append((int(m.group(1)), p))
    matched.sort(key=lambda t: t[0])
    return [p for _, p in matched]


def _atomic_write(target: Path, content: str, create_parents: bool) -> int:
    parent = target.parent
    if not parent.exists():
        if create_parents:
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
    return len(content.encode("utf-8"))


def run(argv: list[str]) -> None:
    # Pre-process argv to handle the edge case where --separator --- is used.
    # argparse treats '---' as the end-of-options marker. To work around this,
    # we replace '---' with a placeholder, then restore it after parsing.
    separator_value = None
    processed_argv = []
    i = 0
    while i < len(argv):
        if argv[i] == "--separator" and i + 1 < len(argv):
            separator_value = argv[i + 1]
            processed_argv.append("--separator")
            processed_argv.append("__PLACEHOLDER_SEP__")
            i += 2
        else:
            processed_argv.append(argv[i])
            i += 1

    parser = argparse.ArgumentParser(prog="assemble_paper.py")
    parser.add_argument("subpath", nargs="?", default=".")
    parser.add_argument("--output", default="out/paper.md")
    parser.add_argument("--separator", default="\n\n")
    args = parser.parse_args(processed_argv)

    # Restore the actual separator value if we found one
    if separator_value is not None:
        args.separator = separator_value

    try:
        base = _lib.resolve_under_root(args.subpath)
    except _lib.TraversalError as e:
        _lib.emit_err(str(e), code=2)

    # Resolve the output relative to subpath, then verify it stays under root.
    output_rel = args.output if args.subpath in (".", "") else f"{args.subpath.rstrip('/')}/{args.output}"
    try:
        target = _lib.resolve_under_root(output_rel)
    except _lib.TraversalError as e:
        _lib.emit_err(str(e), code=2)

    ext = target.suffix.lower()
    if ext not in _WRITE_ALLOWLIST:
        _lib.emit_err(
            f"refusing to write extension '{ext}'; allowlist is {sorted(_WRITE_ALLOWLIST)}",
            code=3,
        )

    sections = _list_sections(base)
    parts = [p.read_text(encoding="utf-8") for p in sections]
    content = args.separator.join(parts)
    bytes_written = _atomic_write(target, content, create_parents=True)

    root = _lib.get_root()
    _lib.emit_ok({
        "path": str(target.relative_to(root)),
        "sections_included": len(sections),
        "bytes_written": bytes_written,
    })


if __name__ == "__main__":
    run(sys.argv[1:])
