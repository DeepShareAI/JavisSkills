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


def test_assemble_skips_symlinked_sections(tmp_path: Path):
    """Symlinked sections must be skipped during assembly (safety §1)."""
    _scaffold(tmp_path)
    outside = tmp_path.parent / "evil.md"
    outside.write_text("EVIL CONTENT")
    (tmp_path / "out" / "sections" / "04-link.md").symlink_to(outside)
    res = _run(tmp_path)
    assert res.returncode == 0, res.stderr
    content = (tmp_path / "out" / "paper.md").read_text()
    assert "EVIL" not in content
    assert json.loads(res.stdout)["sections_included"] == 3
