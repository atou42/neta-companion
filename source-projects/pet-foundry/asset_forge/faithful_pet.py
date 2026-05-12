from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
HATCH_PET_DIR = REPO_ROOT / "vendor" / "openai-skills" / "hatch-pet"
HATCH_PET_SCRIPTS = HATCH_PET_DIR / "scripts"

ATLAS = {
    "columns": 8,
    "rows": 9,
    "cell_width": 192,
    "cell_height": 208,
    "width": 1536,
    "height": 1872,
}

ROWS = [
    ("idle", 0, 6),
    ("running-right", 1, 8),
    ("running-left", 2, 8),
    ("waving", 3, 4),
    ("jumping", 4, 5),
    ("failed", 5, 8),
    ("waiting", 6, 6),
    ("running", 7, 6),
    ("review", 8, 6),
]


def rows_from_upstream_reference() -> list[tuple[str, int, int]]:
    path = HATCH_PET_DIR / "references" / "animation-rows.md"
    if not path.is_file():
        raise FileNotFoundError(f"missing upstream animation row reference: {path}")

    rows: list[tuple[str, int, int]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("| "):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 3 or not cells[0].isdigit():
            continue
        row_index = int(cells[0])
        state = cells[1]
        used_columns = cells[2]
        start_raw, end_raw = used_columns.split("-", 1)
        start = int(start_raw)
        end = int(end_raw)
        if start != 0:
            raise ValueError(f"unsupported upstream used column range for {state}: {used_columns}")
        rows.append((state, row_index, end + 1))
    return rows

REQUIRED_UPSTREAM_FILES = [
    "SKILL.md",
    "LICENSE.txt",
    "references/animation-rows.md",
    "references/codex-pet-contract.md",
    "references/qa-rubric.md",
    "scripts/prepare_pet_run.py",
    "scripts/pet_job_status.py",
    "scripts/record_imagegen_result.py",
    "scripts/extract_strip_frames.py",
    "scripts/inspect_frames.py",
    "scripts/compose_atlas.py",
    "scripts/validate_atlas.py",
    "scripts/make_contact_sheet.py",
    "scripts/render_animation_videos.py",
    "scripts/package_custom_pet.py",
    "scripts/finalize_pet_run.py",
    "scripts/queue_pet_repairs.py",
    "scripts/derive_running_left_from_running_right.py",
]


def assert_upstream_vendor_complete() -> None:
    missing = [rel for rel in REQUIRED_UPSTREAM_FILES if not (HATCH_PET_DIR / rel).is_file()]
    if missing:
        raise FileNotFoundError("missing hatch-pet upstream files: " + ", ".join(missing))


def hatch_pet_script(name: str) -> Path:
    assert_upstream_vendor_complete()
    path = HATCH_PET_SCRIPTS / name
    if not path.is_file():
        raise FileNotFoundError(f"missing hatch-pet script: {name}")
    return path


def run_hatch_pet_script(name: str, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    path = hatch_pet_script(name)
    return subprocess.run(
        [sys.executable, str(path), *args],
        text=True,
        check=check,
        capture_output=True,
    )
