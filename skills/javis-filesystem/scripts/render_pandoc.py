#!/usr/bin/env python3
"""Render a paper-project markdown file via Pandoc. Skips silently if pandoc is missing.

Usage:
    render_pandoc.py [<subpath>] [--input out/paper.md] [--output out/paper.tex]
                     [--template <path>] [--bibliography inputs/refs.bib]
                     [--extra-arg <flag>] ...
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _lib

_OUTPUT_EXTS = (".tex", ".pdf")
_TIMEOUT_S = 120
_EXTRA_ARG_PREFIXES = (
    "--toc",
    "--number-sections",
    "--pdf-engine=",
    "--metadata=",
    "--variable=",
)


def _join_subpath(subpath: str, rel: str) -> str:
    if subpath in ("", ".", "./"):
        return rel
    return f"{subpath.rstrip('/')}/{rel}"


def _validate_extra_args(extra_args: list[str]) -> list[str]:
    for arg in extra_args:
        if not arg.startswith("--"):
            _lib.emit_err(f"extra_arg must start with '--': {arg!r}", code=3)
        if not any(arg == p or arg.startswith(p) for p in _EXTRA_ARG_PREFIXES):
            _lib.emit_err(f"extra_arg is not allowlisted: {arg!r}", code=3)
    return list(extra_args)


def run(argv: list[str]) -> None:
    # Pre-parse extra-args to validate them before full parsing
    extra_args = []
    i = 0
    while i < len(argv):
        if argv[i] == "--extra-arg" and i + 1 < len(argv):
            extra_args.append(argv[i + 1])
            i += 2
        else:
            i += 1

    # Validate extra args early (before full parsing)
    _validate_extra_args(extra_args)

    parser = argparse.ArgumentParser(prog="render_pandoc.py")
    parser.add_argument("subpath", nargs="?", default=".")
    parser.add_argument("--input", default="out/paper.md")
    parser.add_argument("--output", default="out/paper.tex")
    parser.add_argument("--template", default=None)
    parser.add_argument("--bibliography", default="inputs/refs.bib")

    # Filter out --extra-arg args for argparse since we handled them
    filtered_argv = []
    i = 0
    while i < len(argv):
        if argv[i] == "--extra-arg" and i + 1 < len(argv):
            i += 2
        else:
            filtered_argv.append(argv[i])
            i += 1

    args = parser.parse_args(filtered_argv)
    # Use the pre-validated extra_args
    args.extra_args = extra_args

    if not any(args.output.endswith(ext) for ext in _OUTPUT_EXTS):
        _lib.emit_err(
            f"output must end in {' or '.join(_OUTPUT_EXTS)}; got {args.output!r}",
            code=3,
        )

    # extra_args already validated above
    safe_extra = args.extra_args

    try:
        input_abs = _lib.resolve_under_root(_join_subpath(args.subpath, args.input))
        output_abs = _lib.resolve_under_root(_join_subpath(args.subpath, args.output))
        bib_abs = _lib.resolve_under_root(_join_subpath(args.subpath, args.bibliography))
    except _lib.TraversalError as e:
        _lib.emit_err(str(e), code=2)

    if args.template is None:
        template_abs = Path(__file__).resolve().parent / "templates" / "journal-default.tex"
    else:
        try:
            template_abs = _lib.resolve_under_root(_join_subpath(args.subpath, args.template))
        except _lib.TraversalError as e:
            _lib.emit_err(str(e), code=2)

    if shutil.which("pandoc") is None:
        _lib.emit_ok({"skipped": True, "reason": "pandoc not on PATH"})
        return

    output_abs.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "pandoc", str(input_abs),
        f"--bibliography={bib_abs}",
        "--citeproc",
        f"--template={template_abs}",
        "-o", str(output_abs),
        *safe_extra,
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        _lib.emit_ok({
            "skipped": False,
            "exit_code": -1,
            "output_path": _join_subpath(args.subpath, args.output),
            "bytes_written": 0,
            "stderr_tail": f"pandoc timed out after {_TIMEOUT_S}s",
        })
        return

    bytes_written = output_abs.stat().st_size if output_abs.exists() else 0
    stderr_tail = (proc.stderr or "")[-2048:]
    if proc.returncode != 0:
        _lib.emit_err(
            f"pandoc exited {proc.returncode}: {stderr_tail}",
            code=7,
        )
    _lib.emit_ok({
        "skipped": False,
        "exit_code": proc.returncode,
        "output_path": _join_subpath(args.subpath, args.output),
        "bytes_written": bytes_written,
        "stderr_tail": stderr_tail,
    })


if __name__ == "__main__":
    run(sys.argv[1:])
