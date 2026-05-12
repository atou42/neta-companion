#!/usr/bin/env python3
"""Deterministic visual-consistency QA for Pet Foundry spritesheets.

This complements geometry alignment QA. It checks whether frames in a row keep a
stable silhouette size, alpha mask, palette, and loop continuity. It is not a
semantic vision model, but it catches common visual failures before users see a
jittery or drifting runtime pet.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from statistics import median
from typing import Any

from PIL import Image

CELL_W = 192
CELL_H = 208
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

THRESHOLDS = {
    "idle": {"size": 0.12, "area": 0.18, "color": 34, "loop": 0.34, "mask_iou": 0.34},
    "waiting": {"size": 0.20, "area": 0.26, "color": 38, "loop": 0.44, "mask_iou": 0.26},
    "review": {"size": 0.16, "area": 0.24, "color": 38, "loop": 0.44, "mask_iou": 0.28},
    "waving": {"size": 0.18, "area": 0.30, "color": 40, "loop": 0.55, "mask_iou": 0.24},
    "running-right": {"size": 0.24, "area": 0.40, "color": 44, "loop": 0.64, "mask_iou": 0.18},
    "running-left": {"size": 0.24, "area": 0.40, "color": 44, "loop": 0.64, "mask_iou": 0.18},
    "running": {"size": 0.22, "area": 0.36, "color": 44, "loop": 0.58, "mask_iou": 0.20},
    "jumping": {"size": 0.26, "area": 0.46, "color": 46, "loop": 0.72, "mask_iou": 0.14},
    "failed": {"size": 0.28, "area": 0.52, "color": 48, "loop": 0.78, "mask_iou": 0.12},
}

HINTS = {
    "size": "Keep the same head/body scale and silhouette size in every frame; do not resize the pet between frames.",
    "area": "Keep non-transparent sprite mass consistent; avoid one frame becoming much larger/smaller or adding detached fragments.",
    "color": "Preserve the same palette, markings, outfit, and accessory colors as the canonical base across all frames.",
    "loop": "Make the first and last frames visually close enough that the loop does not pop.",
    "mask": "Keep the same full-body pet silhouette recognizable in each frame; avoid identity drift or missing parts.",
}


def bbox_alpha(cell: Image.Image, threshold: int = 8) -> tuple[int, int, int, int] | None:
    alpha = cell.getchannel("A")
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


def alpha_mask(cell: Image.Image, threshold: int = 8) -> set[tuple[int, int]]:
    alpha = cell.getchannel("A")
    pix = alpha.load()
    return {(x, y) for y in range(alpha.height) for x in range(alpha.width) if pix[x, y] > threshold}


def mask_iou(a: set[tuple[int, int]], b: set[tuple[int, int]]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def color_mean(cell: Image.Image, threshold: int = 8) -> tuple[float, float, float]:
    rgba = cell.convert("RGBA")
    pix = rgba.load()
    r = g = b = count = 0
    for y in range(rgba.height):
        for x in range(rgba.width):
            pr, pg, pb, pa = pix[x, y]
            if pa > threshold:
                r += pr
                g += pg
                b += pb
                count += 1
    if not count:
        return (0.0, 0.0, 0.0)
    return (r / count, g / count, b / count)


def color_distance(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def normalized_cell_diff(a: Image.Image, b: Image.Image) -> float:
    a = a.convert("RGBA")
    b = b.convert("RGBA")
    pa = a.load()
    pb = b.load()
    total = 0.0
    n = a.width * a.height
    for y in range(a.height):
        for x in range(a.width):
            ar, ag, ab, aa = pa[x, y]
            br, bg, bb, ba = pb[x, y]
            total += (abs(ar - br) + abs(ag - bg) + abs(ab - bb) + abs(aa - ba)) / (255 * 4)
    return total / n


def check_row(sheet: Image.Image, state: str, row: int, frames: int) -> dict[str, Any]:
    thresholds = THRESHOLDS[state]
    cells: list[Image.Image] = []
    infos: list[dict[str, Any]] = []
    widths: list[int] = []
    heights: list[int] = []
    areas: list[int] = []
    colors: list[tuple[float, float, float]] = []
    masks: list[set[tuple[int, int]]] = []
    errors: list[str] = []
    repair_hints: set[str] = set()

    for frame in range(frames):
        cell = sheet.crop((frame * CELL_W, row * CELL_H, (frame + 1) * CELL_W, (row + 1) * CELL_H)).convert("RGBA")
        cells.append(cell)
        bbox = bbox_alpha(cell)
        if bbox is None:
            errors.append(f"frame {frame + 1} is empty")
            repair_hints.add(HINTS["area"])
            infos.append({"frame": frame, "empty": True})
            continue
        left, top, right, bottom = bbox
        width = right - left
        height = bottom - top
        mask = alpha_mask(cell)
        area = len(mask)
        color = color_mean(cell)
        widths.append(width)
        heights.append(height)
        areas.append(area)
        colors.append(color)
        masks.append(mask)
        infos.append({"frame": frame, "bbox": [left, top, right, bottom], "width": width, "height": height, "area": area, "meanColor": color})

    if not areas:
        return {"state": state, "row": row, "ok": False, "errors": errors or ["row is empty"], "repairHints": list(repair_hints), "frames": infos}

    med_w = median(widths)
    med_h = median(heights)
    med_area = median(areas)
    med_color = tuple(median([c[i] for c in colors]) for i in range(3))

    max_size_drift = max(max(abs(w - med_w) / max(1, med_w), abs(h - med_h) / max(1, med_h)) for w, h in zip(widths, heights))
    max_area_drift = max(abs(a - med_area) / max(1, med_area) for a in areas)
    max_color_dist = max(color_distance(c, med_color) for c in colors)
    min_iou = min(mask_iou(mask, masks[0]) for mask in masks[1:]) if len(masks) > 1 else 1.0
    loop_diff = normalized_cell_diff(cells[0], cells[frames - 1]) if frames > 1 else 0.0

    if max_size_drift > thresholds["size"]:
        errors.append(f"size drift {max_size_drift:.2f} exceeds {thresholds['size']:.2f}")
        repair_hints.add(HINTS["size"])
    if max_area_drift > thresholds["area"]:
        errors.append(f"alpha area drift {max_area_drift:.2f} exceeds {thresholds['area']:.2f}")
        repair_hints.add(HINTS["area"])
    if max_color_dist > thresholds["color"]:
        errors.append(f"palette/color drift {max_color_dist:.1f} exceeds {thresholds['color']:.1f}")
        repair_hints.add(HINTS["color"])
    if loop_diff > thresholds["loop"]:
        errors.append(f"loop pop diff {loop_diff:.2f} exceeds {thresholds['loop']:.2f}")
        repair_hints.add(HINTS["loop"])
    if min_iou < thresholds["mask_iou"]:
        errors.append(f"mask similarity {min_iou:.2f} below {thresholds['mask_iou']:.2f}")
        repair_hints.add(HINTS["mask"])

    return {
        "state": state,
        "row": row,
        "ok": not errors,
        "errors": errors,
        "repairHints": sorted(repair_hints),
        "metrics": {
            "maxSizeDrift": max_size_drift,
            "maxAreaDrift": max_area_drift,
            "maxColorDistance": max_color_dist,
            "loopDiff": loop_diff,
            "minMaskIoU": min_iou,
        },
        "frames": infos,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run visual consistency QA on a Pet Foundry spritesheet")
    parser.add_argument("spritesheet", type=Path)
    parser.add_argument("--json-out", type=Path)
    args = parser.parse_args()

    with Image.open(args.spritesheet) as opened:
        sheet = opened.convert("RGBA")
    rows = [check_row(sheet, *row) for row in ROWS]
    errors = [f"{row['state']}: {error}" for row in rows for error in row.get("errors", [])]
    payload = {"ok": not errors, "spritesheet": str(args.spritesheet), "errors": errors, "rows": rows}
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
