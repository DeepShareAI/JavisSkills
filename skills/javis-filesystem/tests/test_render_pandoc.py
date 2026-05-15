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
