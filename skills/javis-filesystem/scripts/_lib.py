"""Shared helpers for javis-filesystem scripts.

- get_root() — returns the resolved working root (JAVIS_FS_ROOT or cwd).
- resolve_under_root(path) — resolves a relative path and verifies it
  stays under the root. Raises TraversalError on absolute paths, dotdot
  escapes, symlink escapes, and unresolvable paths.
- emit_ok(data) / emit_err(msg, code) — uniform JSON output to stdout/stderr.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, NoReturn


class TraversalError(Exception):
    """Path resolved outside its root or could not be resolved."""


def get_root() -> Path:
    """Return the working root: $JAVIS_FS_ROOT if set, else cwd."""
    raw = os.environ.get("JAVIS_FS_ROOT")
    if raw:
        return Path(raw).resolve()
    return Path.cwd().resolve()


def resolve_under_root(path: str) -> Path:
    """Resolve `path` (relative to root) and verify it stays under root."""
    root = get_root()
    user_path = Path(path)
    if user_path.is_absolute():
        raise TraversalError(f"absolute paths are not allowed: '{path}'")
    try:
        candidate = (root / user_path).resolve(strict=True)
    except FileNotFoundError:
        # Path doesn't exist, resolve with strict=False and check containment
        candidate = (root / user_path).resolve(strict=False)
    except (OSError, RuntimeError) as exc:
        raise TraversalError(
            f"path '{path}' could not be resolved: {exc}"
        ) from exc
    if candidate != root and root not in candidate.parents:
        raise TraversalError(f"path '{path}' resolves outside root")
    return candidate


def emit_ok(data: Any) -> None:
    """Print a JSON success payload to stdout. Does not exit."""
    sys.stdout.write(json.dumps(data))
    sys.stdout.write("\n")
    sys.stdout.flush()


def emit_err(message: str, code: int = 1) -> NoReturn:
    """Print a JSON error payload to stderr and exit with `code`."""
    sys.stderr.write(json.dumps({"error": message}))
    sys.stderr.write("\n")
    sys.stderr.flush()
    sys.exit(code)
