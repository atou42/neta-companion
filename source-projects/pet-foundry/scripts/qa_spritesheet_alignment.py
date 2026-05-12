#!/usr/bin/env python3
"""Heuristic post-finalize QA for Pet Foundry spritesheets.

This script performs geometry checks that complement hatch-pet's built-in QA:
for each used frame cell it estimates the non-transparent bounding box and
flags rows with large anchor/center drift, clipped cells, or empty frames.
It is intentionally conservative: it should trigger regeneration only for rows
that are visibly likely to pop or slide.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import median
from typing import Any

from PIL import Image

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
CELL_WIDTH = 192
CELL_HEIGHT = 208


def bbox_alpha(image: Image.Image, threshold: int = 8) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    pix = alpha.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(alpha.height):
        for x in range(alpha.width):
            if pix[x, y] > threshold:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def check_row(sheet: Image.Image, state: str, row: int, frames: int, args: argparse.Namespace) -> dict[str, Any]:
    cells: list[dict[str, Any]] = []
    errors: list[str] = []
    anchors: list[float] = []
    centers: list[float] = []
    tops: list[float] = []
    for frame in range(frames):
        crop = sheet.crop((frame * CELL_WIDTH, row * CELL_HEIGHT, (frame + 1) * CELL_WIDTH, (row + 1) * CELL_HEIGHT)).convert("RGBA")
        bbox = bbox_alpha(crop)
        if bbox is None:
            errors.append(f"frame {frame + 1} is empty")
            cells.append({"frame": frame, "empty": True})
            continue
        left, top, right, bottom = bbox
        width = right - left
        height = bottom - top
        center_x = (left + right) / 2
        anchors.append(bottom)
        centers.append(center_x)
        tops.append(top)
        if left <= args.edge_margin or right >= CELL_WIDTH - args.edge_margin:
            errors.append(f"frame {frame + 1} may be horizontally clipped")
        if top <= args.edge_margin or bottom >= CELL_HEIGHT - args.edge_margin:
            errors.append(f"frame {frame + 1} may be vertically clipped")
        cells.append(
            {
                "frame": frame,
                "bbox": [left, top, right, bottom],
                "width": width,
                "height": height,
                "centerX": center_x,
                "anchorY": bottom,
            }
        )

    if anchors:
        anchor_med = median(anchors)
        center_med = median(centers)
        anchor_drift = max(abs(v - anchor_med) for v in anchors)
        center_drift = max(abs(v - center_med) for v in centers)
        allowed_anchor = args.motion_anchor_drift if state in {"jumping", "running-right", "running-left"} else args.anchor_drift
        allowed_center = args.motion_center_drift if state in {"running-right", "running-left"} else args.center_drift
        if anchor_drift > allowed_anchor:
            errors.append(f"anchor drift {anchor_drift:.1f}px exceeds {allowed_anchor}px")
        if center_drift > allowed_center:
            errors.append(f"center drift {center_drift:.1f}px exceeds {allowed_center}px")
    else:
        anchor_drift = None
        center_drift = None

    return {
        "state": state,
        "row": row,
        "frames": frames,
        "ok": not errors,
        "errors": errors,
        "anchorDrift": anchor_drift,
        "centerDrift": center_drift,
        "cells": cells,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run heuristic spritesheet alignment QA")
    parser.add_argument("spritesheet", type=Path)
    parser.add_argument("--json-out", type=Path)
    parser.add_argument("--edge-margin", type=int, default=2)
    parser.add_argument("--anchor-drift", type=float, default=18)
    parser.add_argument("--center-drift", type=float, default=22)
    parser.add_argument("--motion-anchor-drift", type=float, default=42)
    parser.add_argument("--motion-center-drift", type=float, default=34)
    args = parser.parse_args()

    with Image.open(args.spritesheet) as opened:
        sheet = opened.convert("RGBA")
    errors: list[str] = []
    if sheet.size != (CELL_WIDTH * 8, CELL_HEIGHT * 9):
        errors.append(f"unexpected sheet size {sheet.width}x{sheet.height}")
    rows = [check_row(sheet, *row, args) for row in ROWS]
    for row in rows:
        for error in row["errors"]:
            errors.append(f"{row['state']}: {error}")
    payload = {"ok": not errors, "spritesheet": str(args.spritesheet), "errors": errors, "rows": rows}
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
