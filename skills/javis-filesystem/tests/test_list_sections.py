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
