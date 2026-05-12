#!/usr/bin/env python3
"""Deterministically reduce per-frame jitter in a Pet Foundry spritesheet.

This does not synthesize, redraw, or patch art. It only shifts the existing
RGBA pixels inside each 192x208 cell so comparable frames in a row share a
stable visual center/anchor. The operation is recorded as Sprite Lab alignment
JSON and optional metadata.
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
CELL_W = 192
CELL_H = 208
SHEET_SIZE = (CELL_W * 8, CELL_H * 9)


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


def alpha_composite_clipped(base: Image.Image, overlay: Image.Image, dest: tuple[int, int]) -> None:
    dst_x, dst_y = dest
    src_left = max(0, -dst_x)
    src_top = max(0, -dst_y)
    src_right = min(overlay.width, base.width - dst_x)
    src_bottom = min(overlay.height, base.height - dst_y)
    if src_right <= src_left or src_bottom <= src_top:
        return
    cropped = overlay.crop((src_left, src_top, src_right, src_bottom))
    base.alpha_composite(cropped, (dst_x + src_left, dst_y + src_top))


def clamp(value: int, limit: int) -> int:
    return max(-limit, min(limit, value))


def compute_offsets(sheet: Image.Image, max_shift: int) -> tuple[dict[tuple[int, int], tuple[int, int]], list[dict[str, Any]]]:
    offsets: dict[tuple[int, int], tuple[int, int]] = {}
    rows_meta: list[dict[str, Any]] = []
    for state, row_index, frame_count in ROWS:
        frames: list[dict[str, Any]] = []
        centers: list[float] = []
        anchors: list[float] = []
        for frame_index in range(frame_count):
            x = frame_index * CELL_W
            y = row_index * CELL_H
            crop = sheet.crop((x, y, x + CELL_W, y + CELL_H)).convert("RGBA")
            bbox = bbox_alpha(crop)
            if bbox is None:
                frames.append({"frame": frame_index, "empty": True})
                continue
            left, top, right, bottom = bbox
            center_x = (left + right) / 2
            anchor_y = bottom
            frames.append({"frame": frame_index, "bbox": [left, top, right, bottom], "centerX": center_x, "anchorY": anchor_y})
            centers.append(center_x)
            anchors.append(anchor_y)
        if not centers:
            rows_meta.append({"state": state, "row": row_index, "frames": frames, "skipped": "empty"})
            continue
        target_center = median(centers)
        target_anchor = median(anchors)
        align_y = state != "jumping"  # jumping intentionally moves vertically; keep its arc.
        for item in frames:
            if item.get("empty"):
                continue
            dx = clamp(round(target_center - float(item["centerX"])), max_shift)
            dy = clamp(round(target_anchor - float(item["anchorY"])), max_shift) if align_y else 0
            offsets[(row_index, int(item["frame"]))] = (dx, dy)
            item["offset"] = {"x": dx, "y": dy}
        rows_meta.append(
            {
                "state": state,
                "row": row_index,
                "targetCenterX": target_center,
                "targetAnchorY": target_anchor,
                "alignY": align_y,
                "frames": frames,
            }
        )
    return offsets, rows_meta


def apply_offsets(sheet: Image.Image, offsets: dict[tuple[int, int], tuple[int, int]]) -> Image.Image:
    out = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
    for state, row_index, frame_count in ROWS:
        for frame_index in range(frame_count):
            src_x = frame_index * CELL_W
            src_y = row_index * CELL_H
            dx, dy = offsets.get((row_index, frame_index), (0, 0))
            cell = sheet.crop((src_x, src_y, src_x + CELL_W, src_y + CELL_H)).convert("RGBA")
            alpha_composite_clipped(out, cell, (src_x + dx, src_y + dy))
    return out


def write_alignment_json(path: Path, sheet_name: str, offsets: dict[tuple[int, int], tuple[int, int]]) -> None:
    payload = {
        "schemaVersion": "pet-foundry.sprite-lab.v0",
        "sheetName": sheet_name,
        "layout": {"width": SHEET_SIZE[0], "height": SHEET_SIZE[1], "rowCount": 9, "slotCount": 8},
        "rows": [{"id": state, "name": state, "frameCount": frames} for state, _row, frames in ROWS],
        "offsets": [
            {"key": f"{row}:{frame}", "x": dx, "y": dy}
            for (row, frame), (dx, dy) in sorted(offsets.items())
            if dx or dy
        ],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Auto-align a Pet Foundry spritesheet")
    parser.add_argument("--spritesheet", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--alignment-out", type=Path)
    parser.add_argument("--metadata-out", type=Path)
    parser.add_argument("--max-shift", type=int, default=28)
    args = parser.parse_args()

    with Image.open(args.spritesheet) as opened:
        sheet = opened.convert("RGBA")
    if sheet.size != SHEET_SIZE:
        raise SystemExit(f"unexpected sheet size {sheet.size}, expected {SHEET_SIZE}")
    offsets, rows_meta = compute_offsets(sheet, args.max_shift)
    out = apply_offsets(sheet, offsets)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.suffix.lower() == ".webp":
        out.save(args.output, lossless=True, method=6)
    else:
        out.save(args.output)
    if args.alignment_out:
        write_alignment_json(args.alignment_out, args.output.name, offsets)
    metadata = {
        "ok": True,
        "tool": "scripts/auto_align_spritesheet.py",
        "source": str(args.spritesheet),
        "output": str(args.output),
        "maxShift": args.max_shift,
        "rows": rows_meta,
    }
    if args.metadata_out:
        args.metadata_out.parent.mkdir(parents=True, exist_ok=True)
        args.metadata_out.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
