#!/usr/bin/env python3
"""Apply Sprite Lab frame-offset alignment JSON to a spritesheet.

This is a deterministic post-processing bridge between the browser-only
sprite-lab tool and the Pet Foundry asset pipeline. It does not synthesize or
redraw artwork; it only copies existing source frame cells into offset target
positions on a transparent canvas using the exported alignment plan.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

SCHEMA_VERSION = "pet-foundry.sprite-lab.v0"


@dataclass(frozen=True)
class Layout:
    width: int
    height: int
    row_count: int
    slot_count: int

    @property
    def cell_width(self) -> float:
        return self.width / self.slot_count

    @property
    def cell_height(self) -> float:
        return self.height / self.row_count


@dataclass(frozen=True)
class Row:
    row_id: str
    name: str
    frame_count: int


def positive_int(value: Any, label: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise ValueError(f"{label} must be a positive integer")
    return parsed


def load_alignment(path: Path) -> tuple[str, Layout, list[Row], dict[tuple[int, int], tuple[int, int]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"unsupported alignment schema: {data.get('schemaVersion')!r}")

    raw_layout = data.get("layout") or {}
    layout = Layout(
        width=positive_int(raw_layout.get("width"), "layout.width"),
        height=positive_int(raw_layout.get("height"), "layout.height"),
        row_count=positive_int(raw_layout.get("rowCount"), "layout.rowCount"),
        slot_count=positive_int(raw_layout.get("slotCount"), "layout.slotCount"),
    )

    if not layout.cell_width.is_integer() or not layout.cell_height.is_integer():
        raise ValueError(
            "alignment layout must divide into integer cells; "
            f"got cell {layout.cell_width} x {layout.cell_height}"
        )

    raw_rows = data.get("rows")
    if not isinstance(raw_rows, list) or len(raw_rows) != layout.row_count:
        raise ValueError("alignment rows must be an array matching layout.rowCount")

    rows: list[Row] = []
    for index, raw_row in enumerate(raw_rows):
        frame_count = positive_int(raw_row.get("frameCount"), f"rows[{index}].frameCount")
        if frame_count > layout.slot_count:
            raise ValueError(f"rows[{index}].frameCount exceeds layout.slotCount")
        rows.append(
            Row(
                row_id=str(raw_row.get("id") or f"row-{index + 1}"),
                name=str(raw_row.get("name") or f"Row {index + 1}"),
                frame_count=frame_count,
            )
        )

    offsets: dict[tuple[int, int], tuple[int, int]] = {}
    for item in data.get("offsets") or []:
        key = str(item.get("key") or "")
        parts = key.split(":")
        if len(parts) != 2:
            raise ValueError(f"invalid offset key: {key!r}")
        row_index = int(parts[0])
        frame_index = int(parts[1])
        if row_index < 0 or row_index >= layout.row_count:
            raise ValueError(f"offset key row is outside layout: {key!r}")
        if frame_index < 0 or frame_index >= layout.slot_count:
            raise ValueError(f"offset key frame is outside layout: {key!r}")
        offsets[(row_index, frame_index)] = (round(float(item.get("x") or 0)), round(float(item.get("y") or 0)))

    return str(data.get("sheetName") or "untitled-sheet"), layout, rows, offsets


def alpha_composite_clipped(base: Image.Image, overlay: Image.Image, dest: tuple[int, int]) -> None:
    """Composite overlay at dest, clipping like browser canvas drawImage."""
    dst_x, dst_y = dest
    src_left = max(0, -dst_x)
    src_top = max(0, -dst_y)
    src_right = min(overlay.width, base.width - dst_x)
    src_bottom = min(overlay.height, base.height - dst_y)
    if src_right <= src_left or src_bottom <= src_top:
        return
    cropped = overlay.crop((src_left, src_top, src_right, src_bottom))
    base.alpha_composite(cropped, (dst_x + src_left, dst_y + src_top))


def apply_alignment(source_path: Path, output_path: Path, layout: Layout, rows: list[Row], offsets: dict[tuple[int, int], tuple[int, int]]) -> dict[str, Any]:
    with Image.open(source_path) as opened:
        source = opened.convert("RGBA")

    if source.size != (layout.width, layout.height):
        raise ValueError(
            f"source image size {source.width} x {source.height} does not match "
            f"alignment layout {layout.width} x {layout.height}"
        )

    cell_width = int(layout.cell_width)
    cell_height = int(layout.cell_height)
    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    frames: list[dict[str, Any]] = []

    for row_index, row in enumerate(rows):
        for frame_index in range(row.frame_count):
            src_x = frame_index * cell_width
            src_y = row_index * cell_height
            offset_x, offset_y = offsets.get((row_index, frame_index), (0, 0))
            dst_x = src_x + offset_x
            dst_y = src_y + offset_y
            frame = source.crop((src_x, src_y, src_x + cell_width, src_y + cell_height))
            alpha_composite_clipped(output, frame, (dst_x, dst_y))
            frames.append(
                {
                    "row": row_index,
                    "state": row.name,
                    "frame": frame_index,
                    "source": {"x": src_x, "y": src_y, "width": cell_width, "height": cell_height},
                    "offset": {"x": offset_x, "y": offset_y},
                    "destination": {"x": dst_x, "y": dst_y, "width": cell_width, "height": cell_height},
                }
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    suffix = output_path.suffix.lower()
    if suffix == ".webp":
        output.save(output_path, lossless=True, method=6)
    else:
        output.save(output_path)

    return {
        "tool": "scripts/apply_sprite_lab_alignment.py",
        "schemaVersion": SCHEMA_VERSION,
        "source": str(source_path),
        "output": str(output_path),
        "layout": {
            "width": layout.width,
            "height": layout.height,
            "rowCount": layout.row_count,
            "slotCount": layout.slot_count,
            "cellWidth": cell_width,
            "cellHeight": cell_height,
        },
        "frames": frames,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply Sprite Lab alignment JSON to a spritesheet")
    parser.add_argument("--spritesheet", required=True, type=Path, help="Input spritesheet image")
    parser.add_argument("--alignment", required=True, type=Path, help="Sprite Lab alignment JSON")
    parser.add_argument("--output", required=True, type=Path, help="Output aligned spritesheet image")
    parser.add_argument("--metadata-out", type=Path, help="Optional JSON metadata/provenance for this deterministic postprocess")
    args = parser.parse_args()

    sheet_name, layout, rows, offsets = load_alignment(args.alignment)
    metadata = apply_alignment(args.spritesheet, args.output, layout, rows, offsets)
    metadata["sheetName"] = sheet_name
    metadata["alignment"] = str(args.alignment)

    if args.metadata_out:
        args.metadata_out.parent.mkdir(parents=True, exist_ok=True)
        args.metadata_out.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({"ok": True, "output": str(args.output), "frames": len(metadata["frames"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
