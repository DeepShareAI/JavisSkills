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
