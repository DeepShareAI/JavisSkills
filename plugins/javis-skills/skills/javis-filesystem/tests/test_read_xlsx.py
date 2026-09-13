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
