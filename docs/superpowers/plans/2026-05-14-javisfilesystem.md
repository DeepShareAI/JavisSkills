# JavisFilesystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `javis-filesystem` skill inside the `JavisSkills` plugin that reproduces Workspace-MCP's local filesystem + paper-project operations, using Claude's built-in tools plus a handful of Python helper scripts. No MCP server.

**Architecture:** A skill folder (`skills/javis-filesystem/`) with `SKILL.md` instructing Claude on operation patterns, a `safety.md` reference, and `scripts/` containing Python helpers ported from `mcp_server/Workspace-MCP`. Each script is self-contained, prints JSON to stdout/stderr, and resolves a single working-root via the `JAVIS_FS_ROOT` env var (defaulting to `cwd`). A small sibling `_lib.py` holds shared traversal-guard and arg-parsing helpers — imported via a sys.path tweak so scripts stay invokable as plain files.

**Tech Stack:** Python 3.11+, openpyxl (xlsx), PyYAML (paper-project meta/manifest), pandoc (optional, external).

**Spec:** `/Users/samuelwei/GoogleDrive/LLM/JavisSkills/docs/specs/2026-05-14-javisfilesystem-design.md`

**Source to port from:** `/Users/samuelwei/GoogleDrive/LLM/mcp_server/Workspace-MCP` (algorithms only — drop MCP server framing and `Roots` registry).

**Spec deviations (caught at planning time):**
1. **`render_pandoc.sh` → `render_pandoc.py`.** The original algorithm has extra-args allowlist validation, timeout handling, and structured JSON output — far too much for a shell script. Switching to Python preserves fidelity and keeps the output contract consistent with the other scripts.
2. **Bundled template.** The original ships `paper/templates/journal-default.tex`. It must come along, placed at `scripts/templates/journal-default.tex`.
3. **Shared `_lib.py`.** Spec §8 says "self-contained — no shared package." Strict adherence would mean copy-pasting the traversal guard into every script. A small sibling `_lib.py` (not a package) gives the same DRY win without violating the spec's intent (which was "no setup, no install"). Documented in the skill.

---

## File Structure

```
JavisSkills/
├── .claude-plugin/
│   └── plugin.json                          # CREATE
├── skills/
│   ├── content-brainstorming/               # already exists (untracked, leave alone)
│   └── javis-filesystem/                    # CREATE
│       ├── SKILL.md
│       ├── safety.md
│       ├── scripts/
│       │   ├── _lib.py                      # shared: root resolution + traversal guard + json output
│       │   ├── safe_write.py
│       │   ├── read_xlsx.py
│       │   ├── list_sections.py
│       │   ├── assemble_paper.py
│       │   ├── render_pandoc.py
│       │   ├── requirements.txt
│       │   └── templates/
│       │       └── journal-default.tex      # carried from Workspace-MCP
│       └── tests/
│           ├── conftest.py
│           ├── test_lib.py
│           ├── test_safe_write.py
│           ├── test_read_xlsx.py
│           ├── test_list_sections.py
│           ├── test_assemble_paper.py
│           └── test_render_pandoc.py
├── docs/
│   ├── specs/2026-05-14-javisfilesystem-design.md    # already committed
│   └── superpowers/plans/2026-05-14-javisfilesystem.md  # this file
└── README.md                                # CREATE or UPDATE
```

**File responsibilities (one job each):**
- `_lib.py` — `resolve_under_root(path)`, `get_root() → Path`, `emit_ok(data)`, `emit_err(msg, code=1)`. Nothing more.
- `safe_write.py` — atomic write + allowlist enforcement.
- `read_xlsx.py` — xlsx → JSON (dict-of-sheets or list-for-one-sheet).
- `list_sections.py` — paper-project section enumeration.
- `assemble_paper.py` — concatenate sections through `safe_write` semantics.
- `render_pandoc.py` — pandoc invocation with extra-args allowlist and timeout.
- `SKILL.md` — activation + operation mapping. Loads `safety.md` for safety rules.
- `safety.md` — atomic write / allowlist / path-traversal rules, restated for Claude.

---

## Task 1: Plugin manifest + skill skeleton

**Files:**
- Create: `JavisSkills/.claude-plugin/plugin.json`
- Create: `JavisSkills/skills/javis-filesystem/scripts/__init__.py` (empty — makes tests importable via path)

- [ ] **Step 1: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "javis-skills",
  "version": "0.1.0",
  "description": "Javis personal-plugin skills: local filesystem operations (more skills coming)",
  "author": "Samuel Wei",
  "skills": [
    "skills/javis-filesystem"
  ]
}
```

Note: `content-brainstorming` has a design spec but no implementation yet — listing it in `skills[]` would risk plugin-load failure. When that skill lands, add it here and bump the version.

- [ ] **Step 2: Create scripts dir scaffold**

```bash
mkdir -p /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem/scripts/templates
mkdir -p /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem/tests
touch /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem/scripts/__init__.py
touch /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem/tests/__init__.py
```

- [ ] **Step 3: Create `scripts/requirements.txt`**

```
openpyxl>=3.1
PyYAML>=6.0
```

- [ ] **Step 4: Commit skeleton**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add .claude-plugin/plugin.json skills/javis-filesystem/scripts/__init__.py skills/javis-filesystem/scripts/requirements.txt skills/javis-filesystem/tests/__init__.py
git commit -m "feat(javis-filesystem): plugin manifest + skill skeleton"
```

---

## Task 2: Shared `_lib.py` (root resolution + traversal guard)

**Files:**
- Create: `skills/javis-filesystem/scripts/_lib.py`
- Test: `skills/javis-filesystem/tests/test_lib.py`
- Test config: `skills/javis-filesystem/tests/conftest.py`

The shared library mirrors `workspace_mcp.safety.resolve_path` but resolves against a single root (cwd or `JAVIS_FS_ROOT`) instead of a named-root registry.

- [ ] **Step 1: Write `conftest.py` with the `tmp_root_env` fixture**

```python
"""Shared pytest fixtures."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Make scripts/ importable as 'scripts.<module>' so tests can `from scripts import _lib`.
_SKILL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_SKILL_ROOT))


@pytest.fixture
def tmp_root(tmp_path: Path, monkeypatch) -> Path:
    """Set JAVIS_FS_ROOT to tmp_path and return the resolved Path."""
    monkeypatch.setenv("JAVIS_FS_ROOT", str(tmp_path.resolve()))
    return tmp_path.resolve()
```

- [ ] **Step 2: Write failing test `test_lib.py`**

```python
"""Tests for _lib: root resolution and traversal guard."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import _lib


def test_get_root_uses_env(tmp_root: Path):
    assert _lib.get_root() == tmp_root


def test_get_root_defaults_to_cwd(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("JAVIS_FS_ROOT", raising=False)
    monkeypatch.chdir(tmp_path)
    assert _lib.get_root() == tmp_path.resolve()


def test_resolves_relative_path_under_root(tmp_root: Path):
    (tmp_root / "a").mkdir()
    assert _lib.resolve_under_root("a") == (tmp_root / "a").resolve()


def test_resolves_dot(tmp_root: Path):
    assert _lib.resolve_under_root(".") == tmp_root


def test_absolute_path_rejected(tmp_root: Path):
    with pytest.raises(_lib.TraversalError, match="absolute"):
        _lib.resolve_under_root("/etc/passwd")


def test_dotdot_traversal_rejected(tmp_root: Path):
    with pytest.raises(_lib.TraversalError, match="outside root"):
        _lib.resolve_under_root("../escape")


def test_symlink_out_rejected(tmp_path: Path, monkeypatch):
    real_root = tmp_path / "root"
    real_root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("x")
    (real_root / "link").symlink_to(outside)
    monkeypatch.setenv("JAVIS_FS_ROOT", str(real_root.resolve()))
    with pytest.raises(_lib.TraversalError, match="outside root"):
        _lib.resolve_under_root("link/secret.txt")


def test_symlink_loop_rejected(tmp_root: Path):
    (tmp_root / "a").symlink_to(tmp_root / "b")
    (tmp_root / "b").symlink_to(tmp_root / "a")
    with pytest.raises(_lib.TraversalError, match="could not be resolved"):
        _lib.resolve_under_root("a/secret.txt")


def test_emit_ok_writes_json_to_stdout(capsys):
    _lib.emit_ok({"hello": "world"})
    out, err = capsys.readouterr()
    assert json.loads(out) == {"hello": "world"}
    assert err == ""


def test_emit_err_writes_json_to_stderr_and_exits(capsys):
    with pytest.raises(SystemExit) as exc:
        _lib.emit_err("boom", code=2)
    out, err = capsys.readouterr()
    assert json.loads(err) == {"error": "boom"}
    assert exc.value.code == 2
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
python3 -m pytest tests/test_lib.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'scripts._lib'` (or similar — _lib.py doesn't exist yet).

- [ ] **Step 4: Implement `_lib.py`**

```python
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
from typing import Any


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
        candidate = (root / user_path).resolve()
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


def emit_err(message: str, code: int = 1) -> None:
    """Print a JSON error payload to stderr and exit with `code`."""
    sys.stderr.write(json.dumps({"error": message}))
    sys.stderr.write("\n")
    sys.stderr.flush()
    sys.exit(code)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
python3 -m pytest tests/test_lib.py -v
```

Expected: 10 passed.

- [ ] **Step 6: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add skills/javis-filesystem/scripts/_lib.py skills/javis-filesystem/tests/conftest.py skills/javis-filesystem/tests/test_lib.py
git commit -m "feat(javis-filesystem): shared _lib for root resolution + traversal guard"
```

---

## Task 3: `safe_write.py` (atomic write + extension allowlist)

**Files:**
- Create: `skills/javis-filesystem/scripts/safe_write.py`
- Test: `skills/javis-filesystem/tests/test_safe_write.py`

CLI contract:
```
safe_write.py <path> [--create-parents]
echo "content" | safe_write.py <path>
```
Reads content from stdin. On success, prints `{"path": "...", "bytes_written": N}` to stdout, exits 0. On failure, prints `{"error": "..."}` to stderr, exits non-zero.

- [ ] **Step 1: Write failing test `test_safe_write.py`**

```python
"""Tests for safe_write.py: atomic write + extension allowlist."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "safe_write.py"


def _run(path_arg: str, content: str, root: Path, *extra_args: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "JAVIS_FS_ROOT": str(root)}
    return subprocess.run(
        [sys.executable, str(SCRIPT), path_arg, *extra_args],
        input=content,
        text=True,
        capture_output=True,
        env=env,
    )


def test_writes_file(tmp_path: Path):
    res = _run("x.md", "hello", tmp_path)
    assert res.returncode == 0, res.stderr
    assert (tmp_path / "x.md").read_text() == "hello"
    payload = json.loads(res.stdout)
    assert payload == {"path": "x.md", "bytes_written": 5}


def test_overwrites(tmp_path: Path):
    (tmp_path / "x.md").write_text("old")
    res = _run("x.md", "new", tmp_path)
    assert res.returncode == 0
    assert (tmp_path / "x.md").read_text() == "new"


def test_atomic_no_partial_on_replace_failure(tmp_path: Path, monkeypatch):
    """When os.replace fails mid-rename, the original must remain and no tmp leak."""
    # We exercise this via an in-process call so we can monkeypatch os.replace.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from scripts import safe_write

    monkeypatch.setenv("JAVIS_FS_ROOT", str(tmp_path))
    target = tmp_path / "x.md"
    target.write_text("original")

    def boom(src, dst):
        raise OSError("simulated rename failure")
    monkeypatch.setattr(os, "replace", boom)

    with pytest.raises(SystemExit):
        safe_write.run(["x.md"], stdin_text="new content")
    assert target.read_text() == "original"
    leftovers = [p for p in tmp_path.iterdir() if ".tmp." in p.name]
    assert leftovers == []


def test_extension_allowlist_rejects_png(tmp_path: Path):
    res = _run("x.png", "fake", tmp_path)
    assert res.returncode != 0
    assert "png" in res.stderr


def test_missing_parent_no_create(tmp_path: Path):
    res = _run("sub/dir/x.md", "hi", tmp_path)
    assert res.returncode != 0
    assert "parent" in res.stderr.lower()


def test_missing_parent_with_create(tmp_path: Path):
    res = _run("sub/dir/x.md", "hi", tmp_path, "--create-parents")
    assert res.returncode == 0
    assert (tmp_path / "sub" / "dir" / "x.md").read_text() == "hi"


def test_parent_is_a_file(tmp_path: Path):
    (tmp_path / "sub").write_text("i am a file")
    res = _run("sub/x.md", "hi", tmp_path)
    assert res.returncode != 0
    assert "not a directory" in res.stderr.lower()


def test_traversal_blocked(tmp_path: Path):
    res = _run("../escape.md", "hi", tmp_path)
    assert res.returncode != 0
    assert "outside root" in res.stderr.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
python3 -m pytest tests/test_safe_write.py -v
```

Expected: FAIL — `safe_write.py` does not exist.

- [ ] **Step 3: Implement `safe_write.py`**

```python
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

# Sibling import — scripts/ is on sys.path because this file lives there.
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
python3 -m pytest tests/test_safe_write.py -v
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add skills/javis-filesystem/scripts/safe_write.py skills/javis-filesystem/tests/test_safe_write.py
git commit -m "feat(javis-filesystem): safe_write.py with atomic write + allowlist"
```

---

## Task 4: `read_xlsx.py`

**Files:**
- Create: `skills/javis-filesystem/scripts/read_xlsx.py`
- Test: `skills/javis-filesystem/tests/test_read_xlsx.py`

CLI contract:
```
read_xlsx.py <path> [--sheet NAME] [--range A1:D20]
```
Output: when `--sheet` is provided, `[{header: value, …}, …]`. Otherwise `{sheet_name: [{header: value, …}, …], …}`. Output mirrors `workspace_mcp.fs.readers.read_xlsx`.

- [ ] **Step 1: Write failing test `test_read_xlsx.py`**

```python
"""Tests for read_xlsx.py."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from openpyxl import Workbook

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "read_xlsx.py"


def _make_xlsx(path: Path, rows_by_sheet: dict[str, list[list]]) -> None:
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in rows_by_sheet.items():
        ws = wb.create_sheet(name)
        for r in rows:
            ws.append(r)
    wb.save(path)


def _run(file_path: Path, root: Path, *extra: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "JAVIS_FS_ROOT": str(root)}
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(file_path.relative_to(root)), *extra],
        text=True,
        capture_output=True,
        env=env,
    )


def test_reads_one_sheet_with_header(tmp_path: Path):
    f = tmp_path / "data.xlsx"
    _make_xlsx(f, {"S": [["a", "b"], [1, 2], [3, 4]]})
    res = _run(f, tmp_path, "--sheet", "S")
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout) == [{"a": 1, "b": 2}, {"a": 3, "b": 4}]


def test_reads_all_sheets_when_no_sheet_arg(tmp_path: Path):
    f = tmp_path / "data.xlsx"
    _make_xlsx(f, {"S1": [["a"], [1]], "S2": [["b"], [2]]})
    res = _run(f, tmp_path)
    assert res.returncode == 0, res.stderr
    payload = json.loads(res.stdout)
    assert payload == {"S1": [{"a": 1}], "S2": [{"b": 2}]}


def test_unknown_sheet_errors(tmp_path: Path):
    f = tmp_path / "data.xlsx"
    _make_xlsx(f, {"S": [["a"], [1]]})
    res = _run(f, tmp_path, "--sheet", "missing")
    assert res.returncode != 0
    assert "missing" in res.stderr


def test_path_not_found_errors(tmp_path: Path):
    res = _run(tmp_path / "nope.xlsx", tmp_path)
    assert res.returncode != 0
    assert "not found" in res.stderr.lower()


def test_range_argument(tmp_path: Path):
    f = tmp_path / "data.xlsx"
    _make_xlsx(f, {"S": [["a", "b"], [1, 2], [3, 4], [5, 6]]})
    res = _run(f, tmp_path, "--sheet", "S", "--range", "A1:B2")
    assert res.returncode == 0, res.stderr
    # A1:B2 means header row + one data row → one record.
    assert json.loads(res.stdout) == [{"a": 1, "b": 2}]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
pip install --user openpyxl PyYAML 2>/dev/null || true
python3 -m pytest tests/test_read_xlsx.py -v
```

Expected: FAIL — `read_xlsx.py` does not exist.

- [ ] **Step 3: Implement `read_xlsx.py`**

```python
#!/usr/bin/env python3
"""Read an .xlsx file and emit JSON.

Usage:
    read_xlsx.py <path> [--sheet NAME] [--range A1:D20]

With --sheet: emits [{header: value, ...}, ...] for that sheet.
Without --sheet: emits {sheet_name: [...rows], ...} for all sheets.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _lib


def _to_rows(ws, range_: str | None) -> list[dict[str, Any]]:
    if range_:
        cells = ws[range_]
        rows = [[c.value for c in row] for row in cells]
    else:
        rows = [[c.value for c in row] for row in ws.iter_rows()]
    if not rows:
        return []
    header = [v if v is not None else f"col{i}" for i, v in enumerate(rows[0])]
    return [dict(zip(header, r)) for r in rows[1:]]


def run(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="read_xlsx.py")
    parser.add_argument("path")
    parser.add_argument("--sheet", default=None)
    parser.add_argument("--range", dest="range_", default=None)
    args = parser.parse_args(argv)

    try:
        target = _lib.resolve_under_root(args.path)
    except _lib.TraversalError as e:
        _lib.emit_err(str(e), code=2)

    if not target.exists():
        _lib.emit_err(f"path not found: '{args.path}'", code=4)
    if not target.is_file():
        _lib.emit_err(f"not a regular file: '{args.path}'", code=5)

    try:
        from openpyxl import load_workbook
        wb = load_workbook(target, data_only=True)
    except Exception as e:
        _lib.emit_err(f"failed to parse '{args.path}': {e}", code=6)

    if args.sheet is not None:
        if args.sheet not in wb.sheetnames:
            _lib.emit_err(f"sheet '{args.sheet}' not in workbook", code=7)
        _lib.emit_ok(_to_rows(wb[args.sheet], args.range_))
        return

    _lib.emit_ok({name: _to_rows(wb[name], args.range_) for name in wb.sheetnames})


if __name__ == "__main__":
    run(sys.argv[1:])
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
python3 -m pytest tests/test_read_xlsx.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add skills/javis-filesystem/scripts/read_xlsx.py skills/javis-filesystem/tests/test_read_xlsx.py
git commit -m "feat(javis-filesystem): read_xlsx.py ported from Workspace-MCP"
```

---

## Task 5: `list_sections.py`

**Files:**
- Create: `skills/javis-filesystem/scripts/list_sections.py`
- Test: `skills/javis-filesystem/tests/test_list_sections.py`

CLI contract:
```
list_sections.py [<subpath>]
```
Lists `<subpath>/out/sections/NN-*.md` ordered by the numeric `NN` prefix. Output: `[{"n": int, "slug": str, "path": str}, …]`.

- [ ] **Step 1: Write failing test `test_list_sections.py`**

```python
"""Tests for list_sections.py."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "list_sections.py"


def _run(root: Path, *args: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "JAVIS_FS_ROOT": str(root)}
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        text=True,
        capture_output=True,
        env=env,
    )


def _scaffold(root: Path, subpath: str = ".") -> Path:
    base = root if subpath == "." else (root / subpath)
    (base / "out" / "sections").mkdir(parents=True, exist_ok=True)
    return base


def test_sorts_by_numeric_prefix(tmp_path: Path):
    base = _scaffold(tmp_path)
    (base / "out" / "sections" / "03-introduction.md").write_text("intro")
    (base / "out" / "sections" / "01-title.md").write_text("title")
    (base / "out" / "sections" / "02-abstract.md").write_text("abs")
    res = _run(tmp_path)
    assert res.returncode == 0, res.stderr
    out = json.loads(res.stdout)
    assert [s["n"] for s in out] == [1, 2, 3]
    assert out[0] == {"n": 1, "slug": "title", "path": "out/sections/01-title.md"}


def test_skips_malformed(tmp_path: Path):
    base = _scaffold(tmp_path)
    (base / "out" / "sections" / "01-good.md").write_text("ok")
    (base / "out" / "sections" / "not-numbered.md").write_text("skip")
    (base / "out" / "sections" / "1-singledigit.md").write_text("skip")
    res = _run(tmp_path)
    assert res.returncode == 0
    out = json.loads(res.stdout)
    assert len(out) == 1
    assert out[0]["slug"] == "good"


def test_missing_sections_dir_returns_empty(tmp_path: Path):
    res = _run(tmp_path)
    assert res.returncode == 0
    assert json.loads(res.stdout) == []


def test_subpath_argument(tmp_path: Path):
    base = _scaffold(tmp_path, subpath="paper-a")
    (base / "out" / "sections" / "01-x.md").write_text("x")
    res = _run(tmp_path, "paper-a")
    assert res.returncode == 0, res.stderr
    out = json.loads(res.stdout)
    assert out[0]["path"] == "out/sections/01-x.md"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
python3 -m pytest tests/test_list_sections.py -v
```

Expected: FAIL — script does not exist.

- [ ] **Step 3: Implement `list_sections.py`**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
python3 -m pytest tests/test_list_sections.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add skills/javis-filesystem/scripts/list_sections.py skills/javis-filesystem/tests/test_list_sections.py
git commit -m "feat(javis-filesystem): list_sections.py ported from Workspace-MCP"
```

---

## Task 6: `assemble_paper.py`

**Files:**
- Create: `skills/javis-filesystem/scripts/assemble_paper.py`
- Test: `skills/javis-filesystem/tests/test_assemble_paper.py`

CLI contract:
```
assemble_paper.py [<subpath>] [--output out/paper.md] [--separator <sep>]
```
Concatenates sections (via `list_sections` logic) and writes through `safe_write` (extension allowlist applies — output must be `.md/.txt/.tex/...`).

- [ ] **Step 1: Write failing test `test_assemble_paper.py`**

```python
"""Tests for assemble_paper.py."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "assemble_paper.py"


def _run(root: Path, *args: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "JAVIS_FS_ROOT": str(root)}
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        text=True,
        capture_output=True,
        env=env,
    )


def _scaffold(root: Path) -> None:
    (root / "out" / "sections").mkdir(parents=True)
    (root / "out" / "sections" / "01-title.md").write_text("# Title\n")
    (root / "out" / "sections" / "02-abstract.md").write_text("# Abstract\n")
    (root / "out" / "sections" / "03-intro.md").write_text("# Intro\n")


def test_assembles_default_path(tmp_path: Path):
    _scaffold(tmp_path)
    res = _run(tmp_path)
    assert res.returncode == 0, res.stderr
    payload = json.loads(res.stdout)
    assert payload["path"] == "out/paper.md"
    assert payload["sections_included"] == 3
    content = (tmp_path / "out" / "paper.md").read_text()
    assert content == "# Title\n\n\n# Abstract\n\n\n# Intro\n"


def test_custom_separator(tmp_path: Path):
    _scaffold(tmp_path)
    res = _run(tmp_path, "--separator", "---")
    assert res.returncode == 0
    content = (tmp_path / "out" / "paper.md").read_text()
    assert "---" in content
    assert content.count("---") == 2  # between 3 sections


def test_custom_output_path(tmp_path: Path):
    _scaffold(tmp_path)
    res = _run(tmp_path, "--output", "out/final.md")
    assert res.returncode == 0, res.stderr
    assert (tmp_path / "out" / "final.md").exists()


def test_output_extension_rejected(tmp_path: Path):
    _scaffold(tmp_path)
    res = _run(tmp_path, "--output", "out/paper.png")
    assert res.returncode != 0
    assert "png" in res.stderr or "allowlist" in res.stderr.lower()


def test_no_sections_writes_empty(tmp_path: Path):
    (tmp_path / "out" / "sections").mkdir(parents=True)
    res = _run(tmp_path)
    assert res.returncode == 0
    assert (tmp_path / "out" / "paper.md").read_text() == ""
    assert json.loads(res.stdout)["sections_included"] == 0


def test_subpath(tmp_path: Path):
    base = tmp_path / "paper-a"
    (base / "out" / "sections").mkdir(parents=True)
    (base / "out" / "sections" / "01-x.md").write_text("X")
    res = _run(tmp_path, "paper-a")
    assert res.returncode == 0, res.stderr
    assert (base / "out" / "paper.md").read_text() == "X"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
python3 -m pytest tests/test_assemble_paper.py -v
```

Expected: FAIL — script does not exist.

- [ ] **Step 3: Implement `assemble_paper.py`**

```python
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
    parser = argparse.ArgumentParser(prog="assemble_paper.py")
    parser.add_argument("subpath", nargs="?", default=".")
    parser.add_argument("--output", default="out/paper.md")
    parser.add_argument("--separator", default="\n\n")
    args = parser.parse_args(argv)

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
python3 -m pytest tests/test_assemble_paper.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add skills/javis-filesystem/scripts/assemble_paper.py skills/javis-filesystem/tests/test_assemble_paper.py
git commit -m "feat(javis-filesystem): assemble_paper.py with atomic write"
```

---

## Task 7: Carry the bundled pandoc template

**Files:**
- Copy: `mcp_server/Workspace-MCP/src/workspace_mcp/paper/templates/journal-default.tex` → `JavisSkills/skills/javis-filesystem/scripts/templates/journal-default.tex`

- [ ] **Step 1: Copy template file**

```bash
cp /Users/samuelwei/GoogleDrive/LLM/mcp_server/Workspace-MCP/src/workspace_mcp/paper/templates/journal-default.tex \
   /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem/scripts/templates/journal-default.tex
```

- [ ] **Step 2: Verify it copied**

```bash
ls -la /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem/scripts/templates/
```

Expected: `journal-default.tex` present, non-zero size.

- [ ] **Step 3: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add skills/javis-filesystem/scripts/templates/journal-default.tex
git commit -m "feat(javis-filesystem): bundle pandoc journal-default template"
```

---

## Task 8: `render_pandoc.py`

**Files:**
- Create: `skills/javis-filesystem/scripts/render_pandoc.py`
- Test: `skills/javis-filesystem/tests/test_render_pandoc.py`

CLI contract:
```
render_pandoc.py [<subpath>] [--input out/paper.md] [--output out/paper.tex] \
                 [--template <path>] [--bibliography inputs/refs.bib] \
                 [--extra-arg --toc] [--extra-arg --number-sections] ...
```
If `pandoc` is not on PATH, emits `{"skipped": true, "reason": "pandoc not on PATH"}` and exits 0. Validates `--extra-arg` entries against an allowlist of safe pandoc flags.

- [ ] **Step 1: Write failing test `test_render_pandoc.py`**

```python
"""Tests for render_pandoc.py."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "render_pandoc.py"


def _run(root: Path, *args: str, path_env: str | None = None) -> subprocess.CompletedProcess:
    env = {**os.environ, "JAVIS_FS_ROOT": str(root)}
    if path_env is not None:
        env["PATH"] = path_env
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        text=True,
        capture_output=True,
        env=env,
    )


def _scaffold(root: Path) -> None:
    (root / "out").mkdir(parents=True)
    (root / "inputs").mkdir(parents=True)
    (root / "out" / "paper.md").write_text("# Hello\n\nWorld.\n")
    (root / "inputs" / "refs.bib").write_text("@article{x, title={X}}\n")


def test_skips_when_pandoc_missing(tmp_path: Path):
    _scaffold(tmp_path)
    # Empty PATH so `pandoc` cannot be found.
    res = _run(tmp_path, path_env="")
    assert res.returncode == 0, res.stderr
    payload = json.loads(res.stdout)
    assert payload == {"skipped": True, "reason": "pandoc not on PATH"}


def test_rejects_non_allowlisted_output_ext(tmp_path: Path):
    _scaffold(tmp_path)
    res = _run(tmp_path, "--output", "out/paper.docx")
    assert res.returncode != 0
    assert "tex" in res.stderr or "pdf" in res.stderr


def test_rejects_non_allowlisted_extra_arg(tmp_path: Path):
    _scaffold(tmp_path)
    res = _run(tmp_path, "--extra-arg", "--evil-flag")
    assert res.returncode != 0
    assert "allowlisted" in res.stderr or "extra" in res.stderr.lower()


def test_accepts_allowlisted_extra_arg(tmp_path: Path):
    """Even without pandoc installed, the script must parse --toc as valid before checking pandoc."""
    _scaffold(tmp_path)
    # Force pandoc missing.
    res = _run(tmp_path, "--extra-arg", "--toc", path_env="")
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout)["skipped"] is True


@pytest.mark.skipif(shutil.which("pandoc") is None, reason="pandoc not installed")
def test_renders_when_pandoc_present(tmp_path: Path):
    _scaffold(tmp_path)
    res = _run(tmp_path)
    assert res.returncode == 0, res.stderr
    payload = json.loads(res.stdout)
    assert payload["skipped"] is False
    assert payload["exit_code"] == 0
    assert (tmp_path / "out" / "paper.tex").exists()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
python3 -m pytest tests/test_render_pandoc.py -v
```

Expected: FAIL — script does not exist.

- [ ] **Step 3: Implement `render_pandoc.py`**

```python
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
    parser = argparse.ArgumentParser(prog="render_pandoc.py")
    parser.add_argument("subpath", nargs="?", default=".")
    parser.add_argument("--input", default="out/paper.md")
    parser.add_argument("--output", default="out/paper.tex")
    parser.add_argument("--template", default=None)
    parser.add_argument("--bibliography", default="inputs/refs.bib")
    parser.add_argument("--extra-arg", action="append", dest="extra_args", default=[])
    args = parser.parse_args(argv)

    if not any(args.output.endswith(ext) for ext in _OUTPUT_EXTS):
        _lib.emit_err(
            f"output must end in {' or '.join(_OUTPUT_EXTS)}; got {args.output!r}",
            code=3,
        )

    safe_extra = _validate_extra_args(args.extra_args)

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
    _lib.emit_ok({
        "skipped": False,
        "exit_code": proc.returncode,
        "output_path": _join_subpath(args.subpath, args.output),
        "bytes_written": bytes_written,
        "stderr_tail": stderr_tail,
    })


if __name__ == "__main__":
    run(sys.argv[1:])
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
python3 -m pytest tests/test_render_pandoc.py -v
```

Expected: 4 passed, 1 skipped (if pandoc absent) or 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add skills/javis-filesystem/scripts/render_pandoc.py skills/javis-filesystem/tests/test_render_pandoc.py
git commit -m "feat(javis-filesystem): render_pandoc.py with allowlist + timeout"
```

---

## Task 9: `safety.md` reference doc

**Files:**
- Create: `skills/javis-filesystem/safety.md`

- [ ] **Step 1: Create `safety.md`**

```markdown
# JavisFilesystem Safety Rules

These rules are mandatory when using this skill. They preserve the guarantees the original `Workspace-MCP` server enforced at the process boundary.

## 1. Root boundary

All operations resolve paths relative to a single working root:
- If the env var `JAVIS_FS_ROOT` is set, that absolute path is the root.
- Otherwise the current working directory is the root.

Every script verifies that the resolved absolute path stays under the root (after symlink resolution). Absolute paths in arguments are rejected. Path-traversal escapes (`../`, symlinks pointing outside) are rejected with exit code 2 and an error of the form `path '<x>' resolves outside root`.

## 2. Atomic writes

Use `scripts/safe_write.py` for every write you care about. It:
1. Writes to a sibling temp file `<target>.tmp.<pid>.<rand>`.
2. `fsync`s the temp file.
3. `os.replace`s it onto the target — atomic on POSIX.
4. On any failure, removes the temp and surfaces the original error.

`assemble_paper.py` uses the same atomic-rename pattern internally.

**Do not use Claude's `Write` tool for paths the user expects to be durable.** Use `safe_write.py`. Claude's `Write` is acceptable only for ad-hoc throwaway files.

## 3. Extension allowlist (writes only)

`safe_write.py` and `assemble_paper.py` reject writes whose extension is not in:

```
.md .txt .tex .yaml .yml .json .bib .csv .html
```

Anything else (figures, PDFs, Excel, binaries) is read-only.

## 4. No deletes

This skill does not delete files. If the user asks to remove a file, tell them to use their shell — the skill intentionally lacks a delete script.

## 5. Pandoc output safety

`render_pandoc.py` requires the output extension to be `.tex` or `.pdf`. Extra pandoc flags must match one of: `--toc`, `--number-sections`, `--pdf-engine=…`, `--metadata=…`, `--variable=…`. Other flags are rejected — this guards against shell-style injection via pandoc args.

## 6. xlsx is read-only

`read_xlsx.py` only reads. There is no `write_xlsx`. Spreadsheets are static inputs.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add skills/javis-filesystem/safety.md
git commit -m "docs(javis-filesystem): safety reference"
```

---

## Task 10: `SKILL.md`

**Files:**
- Create: `skills/javis-filesystem/SKILL.md`

- [ ] **Step 1: Create `SKILL.md`**

````markdown
---
name: javis-filesystem
description: Use whenever the user wants to read, write, list, glob, or stat local files, parse spreadsheets, or work with a paper-project layout (sections, assembly, pandoc render). Pairs with the javis_mcp connector — use this skill for files, use javis_mcp for transcripts/sessions/summaries.
---

# JavisFilesystem

Local filesystem and paper-project operations, ported from the Workspace-MCP stdio server. No MCP server required — operations use Claude's built-in tools plus the helper scripts in `scripts/`.

## When to use

- Reading or writing files in the user's working directory
- Listing or globbing directories
- Reading `.xlsx` spreadsheets
- Working with a paper-project layout: list sections, assemble paper, render pandoc

## When NOT to use

- Voice sessions, transcripts, groups, summaries → use the **`javis_mcp` connector** tools (`list_sessions_tool`, `get_transcript_tool`, `search_transcripts_tool`, etc.).
- File deletion → this skill does not delete. Tell the user to use their shell.

## Working root

Operations resolve paths relative to a single working root:
- `JAVIS_FS_ROOT` env var if set
- Otherwise the user's current working directory

Path traversal outside the root is rejected. See `safety.md` for the full rules.

## Operation map

| What the user asks for | What you do |
|---|---|
| Read a text file, PDF, image | Use Claude's built-in `Read` tool — it already handles text/image/PDF. |
| List a directory | `Bash`: `ls -la <path>` |
| Stat a file | `Bash`: `stat -f '%Sm %z %N' <path>` (macOS) or `stat -c '%y %s %n' <path>` (Linux) |
| Glob | `Bash`: shell glob or `find <root> -name '<pattern>'` |
| Parse an .xlsx | `Bash`: `python3 scripts/read_xlsx.py <path> [--sheet NAME] [--range A1:D20]` |
| Write a text file | `Bash` (piped stdin): `printf '<content>' \| python3 scripts/safe_write.py <path> [--create-parents]` |
| Make a directory | `Bash`: `mkdir -p <path>` |
| List paper sections | `Bash`: `python3 scripts/list_sections.py [<subpath>]` |
| Assemble a paper | `Bash`: `python3 scripts/assemble_paper.py [<subpath>] [--output out/paper.md] [--separator <sep>]` |
| Render pandoc | `Bash`: `python3 scripts/render_pandoc.py [<subpath>] [--input ...] [--output out/paper.tex] [--extra-arg --toc] ...` |

## Rules

1. **Always use `safe_write.py` for durable writes.** Claude's `Write` is acceptable only for ad-hoc temporary files; use `safe_write.py` for anything you want atomic + allowlisted. See `safety.md`.
2. **Extension allowlist:** writes are restricted to `.md .txt .tex .yaml .yml .json .bib .csv .html`. Anything else is read-only.
3. **No deletes.** If the user asks to remove a file, tell them to use their shell.
4. **Check exit codes.** All helper scripts emit JSON to stdout on success (exit 0) and JSON `{"error": "..."}` to stderr on failure (non-zero exit). After every `Bash` call to a script, check the exit code and parse stderr if non-zero.

## Script discovery

When invoking helper scripts, use the absolute path resolved from this SKILL.md's location: scripts live at `<this-skill-dir>/scripts/`. Concretely, the personal-plugin runtime exposes the plugin root as an env var or via the skill's resolved path — pick whichever is available and prefix script invocations with that path. If neither is available, fall back to a `find` for the script under the user's plugins directory.

## Setup (one time per machine)

If a script that needs openpyxl or PyYAML fails with `ModuleNotFoundError`, install requirements once:

```bash
pip3 install --user -r <plugin-root>/skills/javis-filesystem/scripts/requirements.txt
```

State this prerequisite to the user before falling through to the install command.

## Detail

- Safety rules: `safety.md`
- Helper scripts: `scripts/`
````

- [ ] **Step 2: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add skills/javis-filesystem/SKILL.md
git commit -m "docs(javis-filesystem): SKILL.md with operation map"
```

---

## Task 11: README

**Files:**
- Create: `JavisSkills/README.md` (assume absent based on prior `ls`; if it exists, prepend the new section above existing content)

- [ ] **Step 1: Check whether README.md exists**

```bash
ls -la /Users/samuelwei/GoogleDrive/LLM/JavisSkills/README.md 2>/dev/null || echo "MISSING"
```

- [ ] **Step 2: Create or update README.md**

If missing, create with this content. If present, prepend a new top section keeping the rest below.

```markdown
# JavisSkills

A personal-plugin bundle for the Javis ecosystem.

## Skills included

| Skill | Purpose |
|---|---|
| `javis-filesystem` | Local filesystem + paper-project operations. Drop-in replacement for the Workspace-MCP stdio server. |
| `content-brainstorming` *(planned)* | Structured brainstorming for reports, articles, news pieces, blog posts. Design only — not yet shipped. |

## Install

Install as a personal plugin. The plugin manifest at `.claude-plugin/plugin.json` declares both skills.

## javis-filesystem prerequisites

The helper scripts need Python 3.11+ and two libraries:

```bash
pip3 install --user openpyxl PyYAML
```

To render papers, install `pandoc` separately. If pandoc is missing, `render_pandoc.py` emits `{"skipped": true, "reason": "pandoc not on PATH"}` and exits 0 — it does not fail loudly.

## Working root

`javis-filesystem` operates on a single working directory at a time:
- Set `JAVIS_FS_ROOT=/absolute/path` to pin it.
- Otherwise it uses the current working directory.

Path traversal outside the root is rejected.

## Coexistence with javis_mcp

`javis-filesystem` is the **filesystem** half of a paired setup. For transcripts, sessions, groups, and summaries, install the **`javis_mcp`** remote connector separately (URL: `https://mcp.javis.is/mcp`). The two surfaces don't overlap.

## Source attribution

`javis-filesystem` is ported from `mcp_server/Workspace-MCP`. That project still works as a standalone stdio MCP server — use whichever delivery model fits your workflow.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add README.md
git commit -m "docs: README with install + javis-filesystem usage"
```

---

## Task 12: End-to-end smoke test + final commit

**Files:**
- No new files. Validation pass only.

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
python3 -m pytest tests/ -v
```

Expected: all tests pass (one `test_renders_when_pandoc_present` skip is acceptable if pandoc is absent).

- [ ] **Step 2: Manual smoke test — write + read round trip**

```bash
cd /tmp && mkdir -p jf-smoke && cd jf-smoke
export JAVIS_FS_ROOT=/tmp/jf-smoke
PLUGIN=/Users/samuelwei/GoogleDrive/LLM/JavisSkills/skills/javis-filesystem
echo "hello world" | python3 $PLUGIN/scripts/safe_write.py greet.md
cat greet.md
```

Expected: stdout `{"path": "greet.md", "bytes_written": 12}`; `cat` prints `hello world`.

- [ ] **Step 3: Manual smoke test — assemble a paper**

```bash
cd /tmp/jf-smoke
mkdir -p out/sections
echo "# Title" > out/sections/01-title.md
echo "# Abstract" > out/sections/02-abstract.md
python3 $PLUGIN/scripts/assemble_paper.py
cat out/paper.md
```

Expected: stdout payload with `sections_included: 2`; `cat` prints title + abstract joined by blank line.

- [ ] **Step 4: Manual smoke test — traversal blocked**

```bash
cd /tmp/jf-smoke
echo "evil" | python3 $PLUGIN/scripts/safe_write.py ../../etc/evil.md
echo "exit code was $?"
```

Expected: exit code non-zero; stderr contains `outside root`.

- [ ] **Step 5: Verify plugin manifest validity**

```bash
python3 -c "import json; print(json.load(open('/Users/samuelwei/GoogleDrive/LLM/JavisSkills/.claude-plugin/plugin.json')))"
```

Expected: dict prints; no JSON decode error.

- [ ] **Step 6: Final git status check**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills && git status && git log --oneline
```

Expected: clean working tree (other than the untracked pre-existing `content-brainstorming` spec); 11+ commits on `main`.

---

## Done criteria

- All tests under `skills/javis-filesystem/tests/` pass.
- All four smoke tests succeed.
- `plugin.json` is valid JSON listing `skills/javis-filesystem`.
- `mcp_server/Workspace-MCP` is unmodified (verify with `cd /Users/samuelwei/GoogleDrive/LLM/mcp_server/Workspace-MCP && git status` — should show no changes from this work).
- `javis-server/javis_mcp` is unmodified.
