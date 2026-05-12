#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from asset_forge.faithful_pet import ATLAS, HATCH_PET_DIR, ROWS, assert_upstream_vendor_complete


CHROMA = "#00FF00"
CHROMA_RGB = (0, 255, 0)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def make_base(path: Path) -> None:
    image = Image.new("RGB", (ATLAS["cell_width"], ATLAS["cell_height"]), CHROMA_RGB)
    draw = ImageDraw.Draw(image)
    cx = ATLAS["cell_width"] // 2
    draw.ellipse((cx - 32, 32, cx + 32, 96), fill=(242, 145, 165), outline=(24, 28, 30), width=4)
    draw.rectangle((cx - 30, 88, cx + 30, 150), fill=(184, 48, 42), outline=(24, 28, 30), width=4)
    draw.rectangle((cx - 24, 148, cx - 8, 184), fill=(36, 38, 40), outline=(24, 28, 30), width=3)
    draw.rectangle((cx + 8, 148, cx + 24, 184), fill=(36, 38, 40), outline=(24, 28, 30), width=3)
    draw.rectangle((cx - 34, 184, cx - 4, 192), fill=(20, 22, 24))
    draw.rectangle((cx + 4, 184, cx + 34, 192), fill=(20, 22, 24))
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def make_strip(path: Path, state: str, frame_count: int) -> None:
    width = ATLAS["cell_width"] * frame_count
    height = ATLAS["cell_height"]
    image = Image.new("RGB", (width, height), CHROMA_RGB)
    draw = ImageDraw.Draw(image)
    for index in range(frame_count):
        left = index * ATLAS["cell_width"]
        cx = left + ATLAS["cell_width"] // 2
        bob = [0, -2, -4, -2, 0, 2, 0, -1][index % 8]
        lean = 0
        if state in {"running-right", "running-left"}:
            lean = 8 if state == "running-right" else -8
        if state == "jumping":
            bob = [8, -8, -28, -12, 4][index]
        if state == "failed":
            bob = min(14, index * 2)
            lean = min(18, index * 3)
        if state == "waving":
            lean = [0, -4, -6, -4][index]
        if state == "review":
            lean = [-2, -4, -2, 0, 2, 4][index % 6]

        head_y = 34 + bob
        body_y = 92 + bob
        draw.ellipse((cx - 32 + lean, head_y, cx + 32 + lean, head_y + 64), fill=(242, 145, 165), outline=(24, 28, 30), width=4)
        draw.rectangle((cx - 30 + lean, body_y, cx + 30 + lean, body_y + 62), fill=(184, 48, 42), outline=(24, 28, 30), width=4)
        leg_phase = index % 4
        left_leg_dx = [-6, -2, 4, 0][leg_phase]
        right_leg_dx = [6, 2, -4, 0][leg_phase]
        if state not in {"running-right", "running-left", "running"}:
            left_leg_dx = right_leg_dx = 0
        leg_top = body_y + 58
        draw.rectangle((cx - 24 + lean + left_leg_dx, leg_top, cx - 8 + lean + left_leg_dx, leg_top + 36), fill=(36, 38, 40), outline=(24, 28, 30), width=3)
        draw.rectangle((cx + 8 + lean + right_leg_dx, leg_top, cx + 24 + lean + right_leg_dx, leg_top + 36), fill=(36, 38, 40), outline=(24, 28, 30), width=3)
        draw.rectangle((cx - 34 + lean + left_leg_dx, leg_top + 36, cx - 4 + lean + left_leg_dx, leg_top + 44), fill=(20, 22, 24))
        draw.rectangle((cx + 4 + lean + right_leg_dx, leg_top + 36, cx + 34 + lean + right_leg_dx, leg_top + 44), fill=(20, 22, 24))
        if state == "waving":
            arm_y = body_y + [20, 4, 0, 10][index]
            draw.rectangle((cx + 30 + lean, arm_y, cx + 52 + lean, arm_y + 10), fill=(36, 38, 40), outline=(24, 28, 30), width=2)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def prepare_synthetic_run(run_dir: Path) -> None:
    if run_dir.exists():
        shutil.rmtree(run_dir)
    decoded = run_dir / "decoded"
    decoded.mkdir(parents=True)

    write_json(
        run_dir / "pet_request.json",
        {
            "pet_id": "faithful-synthetic",
            "display_name": "Faithful Synthetic",
            "description": "Synthetic acceptance pet for the vendored hatch-pet pipeline.",
            "chroma_key": {"hex": CHROMA},
        },
    )

    jobs = []
    base_path = decoded / "base.png"
    make_base(base_path)
    base_hash = sha256(base_path)
    jobs.append(
        {
            "id": "base",
            "status": "complete",
            "output_path": "decoded/base.png",
            "source_path": "decoded/base.png",
            "source_sha256": base_hash,
            "synthetic_test_source": True,
        }
    )

    for state, _row, frame_count in ROWS:
        row_path = decoded / f"{state}.png"
        make_strip(row_path, state, frame_count)
        row_hash = sha256(row_path)
        jobs.append(
            {
                "id": state,
                "status": "complete",
                "output_path": f"decoded/{state}.png",
                "source_path": f"decoded/{state}.png",
                "source_sha256": row_hash,
                "synthetic_test_source": True,
            }
        )

    write_json(run_dir / "imagegen-jobs.json", {"jobs": jobs})


def run_acceptance(run_dir: Path) -> dict[str, Any]:
    assert_upstream_vendor_complete()
    prepare_synthetic_run(run_dir)
    command = [
        sys.executable,
        str(HATCH_PET_DIR / "scripts" / "finalize_pet_run.py"),
        "--run-dir",
        str(run_dir),
        "--allow-synthetic-test-sources",
        "--skip-videos",
        "--skip-package",
    ]
    completed = subprocess.run(command, text=True, capture_output=True)
    result = {
        "command": command,
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "runDir": str(run_dir),
        "expected": {
            "spritesheetPng": str(run_dir / "final" / "spritesheet.png"),
            "spritesheetWebp": str(run_dir / "final" / "spritesheet.webp"),
            "validation": str(run_dir / "final" / "validation.json"),
            "review": str(run_dir / "qa" / "review.json"),
            "contactSheet": str(run_dir / "qa" / "contact-sheet.png"),
            "summary": str(run_dir / "qa" / "run-summary.json"),
        },
    }
    write_json(run_dir / "qa" / "faithful-acceptance-command.json", result)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--run-dir",
        default=str(ROOT / "validation" / "faithful-pet" / "synthetic-run"),
    )
    args = parser.parse_args()
    result = run_acceptance(Path(args.run_dir).resolve())
    print(json.dumps({"status": "PASS", "runDir": result["runDir"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
