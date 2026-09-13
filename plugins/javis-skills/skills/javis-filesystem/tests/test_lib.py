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
