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
