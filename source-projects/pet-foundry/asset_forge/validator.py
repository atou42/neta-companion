from __future__ import annotations

import argparse
import copy
import hashlib
import hmac
import json
from pathlib import Path
from typing import Any

from PIL import Image


PROFILE_BY_KIND = {
    "object-state-sheet": "object.v0",
    "icon-set": "icon.v0",
    "simple-vfx-sheet": "vfx.v0",
    "tile-variant-sheet": "tile.experimental",
    "character-action-sheet": "character.experimental",
}

PRODUCTION_KINDS = {"object-state-sheet", "icon-set", "simple-vfx-sheet"}
DEV_REVIEW_SECRET = b"asset-forge-v0-local-review-secret"


class ValidationError(Exception):
    pass


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def sha256_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def review_signature_payload(review: dict[str, Any]) -> dict[str, Any]:
    payload = copy.deepcopy(review)
    payload.pop("reviewSignature", None)
    return payload


def sign_review(review: dict[str, Any]) -> str:
    payload = canonical_json(review_signature_payload(review)).encode("utf-8")
    return "hmac-sha256:" + hmac.new(DEV_REVIEW_SECRET, payload, hashlib.sha256).hexdigest()


def manifest_hash_value(manifest: dict[str, Any]) -> str:
    stable = copy.deepcopy(manifest)
    stable.pop("manifestHash", None)
    stable.pop("packageHash", None)
    validation = stable.get("validation")
    if isinstance(validation, dict):
        validation.pop("reviewPath", None)
        validation.pop("reviewHash", None)
        validation.pop("exportEligibilityPath", None)
        validation.pop("exportEligibilityHash", None)
    stable.pop("exports", None)
    return sha256_text(canonical_json(stable))


def package_hash_value(root: Path, manifest: dict[str, Any]) -> str:
    entries: list[tuple[str, str]] = []
    for file_path in sorted(path for path in root.rglob("*") if path.is_file()):
        rel = file_path.relative_to(root).as_posix()
        if rel == "asset.manifest.json":
            continue
        else:
            digest = sha256_file(file_path)
        entries.append((rel, digest))
    stable = copy.deepcopy(manifest)
    stable.pop("packageHash", None)
    entries.append(("asset.manifest.json", sha256_text(canonical_json(stable))))
    entries.sort()
    return sha256_text(canonical_json(entries))


def read_json(path: Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError as exc:
        raise ValidationError(f"missing file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValidationError(f"invalid json: {path}: {exc}") from exc


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def require_key(mapping: dict[str, Any], key: str, label: str) -> Any:
    require(isinstance(mapping, dict), f"{label} must be an object")
    require(key in mapping, f"{label}.{key} is required")
    return mapping[key]


def validate_contract(contract: dict[str, Any]) -> None:
    required = [
        "schemaVersion",
        "assetId",
        "assetKind",
        "stylePreset",
        "targetUse",
        "exportTargets",
        "geometry",
        "semantics",
        "consistency",
        "validation",
    ]
    for key in required:
        require(key in contract, f"contract.{key} is required")

    kind = contract["assetKind"]
    require(kind in PROFILE_BY_KIND, f"unsupported assetKind: {kind}")
    profile = contract["validation"].get("profile")
    require(profile == PROFILE_BY_KIND[kind], f"assetKind {kind} must use {PROFILE_BY_KIND[kind]}")
    require("requiresHumanReview" in contract["validation"], "contract.validation.requiresHumanReview is required")

    geometry = contract["geometry"]
    for key in ["columns", "rows", "cellWidth", "cellHeight", "background"]:
        require(key in geometry, f"contract.geometry.{key} is required")
    background = geometry["background"]
    require("mode" in background, "contract.geometry.background.mode is required")
    require("color" in background, "contract.geometry.background.color is required")

    if kind == "object-state-sheet":
        states = contract["semantics"].get("states")
        require(isinstance(states, list) and states, "contract.semantics.states is required")
        for state in states:
            for key in ["id", "row", "frames", "fps", "loop"]:
                require(key in state, f"contract.semantics.states[].{key} is required")
        require(len(states) == int(geometry["rows"]), "object states must match geometry rows")
        require({int(state["row"]) for state in states} == set(range(int(geometry["rows"]))), "object state rows must cover geometry rows")
        require(contract["consistency"].get("shapeLock"), "contract.consistency.shapeLock is required")
        require(contract["consistency"].get("materialLock"), "contract.consistency.materialLock is required")
    elif kind == "icon-set":
        semantics = contract["semantics"]
        require("groups" in semantics, "contract.semantics.groups is required")
        require("icons" in semantics, "contract.semantics.icons is required")
        family_lock = contract["consistency"].get("familyLock")
        require(isinstance(family_lock, dict), "contract.consistency.familyLock is required")
        for key in ["view", "scale", "padding", "outline", "lightDirection", "allowText"]:
            require(key in family_lock, f"contract.consistency.familyLock.{key} is required")
    elif kind == "simple-vfx-sheet":
        semantics = contract["semantics"]
        require("frames" in semantics, "contract.semantics.frames is required")
        require("phases" in semantics, "contract.semantics.phases is required")
        bounds = contract["consistency"].get("bounds")
        require(isinstance(bounds, dict), "contract.consistency.bounds is required")
        for key in ["centerPoint", "maxBBoxWidthRatio", "maxBBoxHeightRatio", "safePaddingPx"]:
            require(key in bounds, f"contract.consistency.bounds.{key} is required")
    elif kind == "character-action-sheet":
        semantics = contract["semantics"]
        directions = semantics.get("directions")
        actions = semantics.get("actions")
        require(isinstance(directions, list) and directions, "contract.semantics.directions is required")
        require(isinstance(actions, list) and actions, "contract.semantics.actions is required")
        for direction in directions:
            for key in ["id", "row"]:
                require(key in direction, f"contract.semantics.directions[].{key} is required")
        for action in actions:
            for key in ["id", "frames", "fps", "loop"]:
                require(key in action, f"contract.semantics.actions[].{key} is required")
        require(len(directions) == int(geometry["rows"]), "character directions must match geometry rows")
        require(int(actions[0]["frames"]) == int(geometry["columns"]), "first character action frames must match geometry columns")
        require(isinstance(contract["consistency"].get("identityLock"), dict), "contract.consistency.identityLock is required")
        require(isinstance(contract["consistency"].get("anchorLock"), dict), "contract.consistency.anchorLock is required")


def validate_image(path: Path, expected_width: int | None, expected_height: int | None, expected_mode: str | None) -> None:
    require(path.exists(), f"missing image: {path}")
    with Image.open(path) as image:
        if expected_width is not None:
            require(image.width == expected_width, f"{path} width {image.width} != {expected_width}")
        if expected_height is not None:
            require(image.height == expected_height, f"{path} height {image.height} != {expected_height}")
        if expected_mode is not None:
            require(image.mode == expected_mode, f"{path} mode {image.mode} != {expected_mode}")


def validate_production_image_content(path: Path, geometry: dict[str, Any]) -> None:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        columns = int(geometry["columns"])
        rows = int(geometry["rows"])
        cell_width = int(geometry["cellWidth"])
        cell_height = int(geometry["cellHeight"])
        for row in range(rows):
            for column in range(columns):
                cell = rgba.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
                alpha = cell.getchannel("A")
                bbox = alpha.getbbox()
                require(bbox is not None, f"cell {row},{column} has no visible content")
                left, top, right, bottom = bbox
                require(left > 0 and top > 0 and right < cell_width and bottom < cell_height, f"cell {row},{column} content touches cell boundary")
                colors = cell.convert("RGB").getcolors(maxcolors=cell_width * cell_height)
                require(colors is not None and len(colors) > 1, f"cell {row},{column} has no visual variation")


def alpha_components(cell: Image.Image, threshold: int = 20) -> list[int]:
    alpha = cell.convert("RGBA").getchannel("A")
    width, height = alpha.size
    pixels = alpha.load()
    seen: set[tuple[int, int]] = set()
    components: list[int] = []
    for y in range(height):
        for x in range(width):
            if (x, y) in seen or pixels[x, y] <= threshold:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            area = 0
            while stack:
                cx, cy = stack.pop()
                area += 1
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen and pixels[nx, ny] > threshold:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            components.append(area)
    components.sort(reverse=True)
    return components


def validate_object_components(path: Path, geometry: dict[str, Any]) -> None:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        columns = int(geometry["columns"])
        rows = int(geometry["rows"])
        cell_width = int(geometry["cellWidth"])
        cell_height = int(geometry["cellHeight"])
        for row in range(rows):
            for column in range(columns):
                cell = rgba.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
                components = alpha_components(cell)
                detached_large = [area for area in components[1:] if area >= 128]
                require(not detached_large, f"object cell {row},{column} has large detached components")


def validate_icon_family(path: Path, geometry: dict[str, Any]) -> None:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        columns = int(geometry["columns"])
        rows = int(geometry["rows"])
        cell_width = int(geometry["cellWidth"])
        cell_height = int(geometry["cellHeight"])
        widths: list[int] = []
        heights: list[int] = []
        for row in range(rows):
            for column in range(columns):
                cell = rgba.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
                bbox = cell.getchannel("A").getbbox()
                require(bbox is not None, f"icon cell {row},{column} has no visible content")
                left, top, right, bottom = bbox
                widths.append(right - left)
                heights.append(bottom - top)
        require(min(widths) > 0 and min(heights) > 0, "icon bbox sizes must be non-zero")
        require(max(widths) / min(widths) <= 1.45, "icon bbox width ratio exceeds v0 family scale")
        require(max(heights) / min(heights) <= 1.2, "icon bbox height ratio exceeds v0 family scale")


def compute_vfx_metrics(path: Path, geometry: dict[str, Any]) -> dict[str, Any]:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        columns = int(geometry["columns"])
        rows = int(geometry["rows"])
        cell_width = int(geometry["cellWidth"])
        cell_height = int(geometry["cellHeight"])
        centers: list[tuple[float, float]] = []
        areas: list[int] = []
        max_bbox_width_ratio = 0.0
        max_bbox_height_ratio = 0.0
        edge_alpha_pixels = 0
        dark_pixels = 0
        for row in range(rows):
            for column in range(columns):
                cell = rgba.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
                alpha = cell.getchannel("A")
                bbox = alpha.getbbox()
                if bbox is None:
                    centers.append((cell_width / 2, cell_height / 2))
                    areas.append(0)
                    continue
                left, top, right, bottom = bbox
                bbox_width = right - left
                bbox_height = bottom - top
                max_bbox_width_ratio = max(max_bbox_width_ratio, bbox_width / cell_width)
                max_bbox_height_ratio = max(max_bbox_height_ratio, bbox_height / cell_height)
                centers.append(((left + right) / 2, (top + bottom) / 2))
                visible_area = 0
                pixels = cell.load()
                for y in range(cell_height):
                    for x in range(cell_width):
                        r, g, b, a = pixels[x, y]
                        if a > 20:
                            visible_area += 1
                            if x == 0 or y == 0 or x == cell_width - 1 or y == cell_height - 1:
                                edge_alpha_pixels += 1
                            if r <= 12 and g <= 12 and b <= 12 and max(r, g, b) - min(r, g, b) <= 6:
                                dark_pixels += 1
                areas.append(visible_area)
        avg_x = sum(x for x, _ in centers) / len(centers)
        avg_y = sum(y for _, y in centers) / len(centers)
        max_center_drift = max(((x - avg_x) ** 2 + (y - avg_y) ** 2) ** 0.5 for x, y in centers)
        area_delta = 0.0 if not areas or max(areas) == 0 else (max(areas) - min(areas)) / max(areas)
        return {
            "edgeAlphaPixels": edge_alpha_pixels,
            "maxBBoxWidthRatio": round(max_bbox_width_ratio, 4),
            "maxBBoxHeightRatio": round(max_bbox_height_ratio, 4),
            "maxCenterDriftPx": round(max_center_drift, 4),
            "backgroundDarkPixelRatio": round(dark_pixels / (rows * columns * cell_width * cell_height), 6),
            "areaRhythmDelta": round(area_delta, 4),
        }


def validate_vfx_metrics(path: Path, geometry: dict[str, Any], diagnostics_json: dict[str, Any]) -> None:
    metrics = diagnostics_json.get("metrics", {})
    required = [
        "edgeAlphaPixels",
        "maxBBoxWidthRatio",
        "maxBBoxHeightRatio",
        "maxCenterDriftPx",
        "backgroundDarkPixelRatio",
        "areaRhythmDelta",
    ]
    for key in required:
        require(key in metrics, f"diagnostics.metrics.{key} is required for vfx.v0")
    computed = compute_vfx_metrics(path, geometry)
    for key in required:
        require(metrics[key] == computed[key], f"diagnostics.metrics.{key} does not match computed VFX metric")
    require(computed["edgeAlphaPixels"] == 0, "VFX edge alpha pixels must be zero")
    require(computed["maxCenterDriftPx"] <= 24, "VFX center drift exceeds v0 bounds")
    require(computed["maxBBoxWidthRatio"] <= 0.95, "VFX bbox width ratio exceeds v0 bounds")
    require(computed["maxBBoxHeightRatio"] <= 0.95, "VFX bbox height ratio exceeds v0 bounds")
    require(computed["backgroundDarkPixelRatio"] <= 0.01, "VFX dark background ratio exceeds v0 bounds")


def validate_source_metadata(root: Path, source: dict[str, Any]) -> None:
    source_path = root / source["path"]
    with Image.open(source_path) as image:
        require(source.get("width") == image.width, f"source metadata width {source.get('width')} != actual {image.width}")
        require(source.get("height") == image.height, f"source metadata height {source.get('height')} != actual {image.height}")
        require(source.get("mode") == image.mode, f"source metadata mode {source.get('mode')} != actual {image.mode}")
    provenance = source.get("provenance")
    if isinstance(provenance, dict):
        for key in ["path", "sha256", "provider", "modelId"]:
            require(key in provenance, f"source provenance.{key} is required")
        validate_file_hash(root, provenance["path"], provenance["sha256"], "source provenance")
        provenance_json = read_json(root / provenance["path"])
        for key in ["provider", "modelId", "prompt", "sourceImageSha256"]:
            require(key in provenance_json, f"sources/provenance.json.{key} is required")
        require(provenance_json["provider"] == provenance["provider"], "source provenance provider mismatch")
        require(provenance_json["modelId"] == provenance["modelId"], "source provenance modelId mismatch")
        require(provenance_json["sourceImageSha256"] == sha256_file(source_path), "source provenance hash does not match source")
        individual_icons = provenance_json.get("metadata", {}).get("individualIcons")
        if isinstance(individual_icons, list):
            require(individual_icons, "source provenance individualIcons cannot be empty")
            for icon in individual_icons:
                for key in ["index", "cell", "path", "sha256", "modelId", "prompt"]:
                    require(key in icon, f"source provenance individualIcons[].{key} is required")
                validate_file_hash(root, icon["path"], icon["sha256"], "individual provider icon")
                cell = icon["cell"]
                require("row" in cell and "column" in cell, "source provenance individualIcons[].cell row and column are required")
                if "metadataPath" in icon:
                    validate_file_hash(root, icon["metadataPath"], icon["metadataSha256"], "individual provider metadata")
    else:
        require(provenance in {None, "source-ingest", "fixture"}, "source provenance must be source-ingest, fixture, null, or a provenance object")


def validate_file_hash(root: Path, rel_path: str, expected_hash: str, label: str) -> None:
    path = root / rel_path
    require(path.exists(), f"missing {label}: {rel_path}")
    actual = sha256_file(path)
    require(actual == expected_hash, f"{label} hash mismatch for {rel_path}")


def validate_exports(root: Path, contract: dict[str, Any], manifest: dict[str, Any]) -> None:
    exports = manifest.get("exports", [])
    require(isinstance(exports, list), "manifest.exports must be a list")
    for export in exports:
        if "sha256" in export:
            validate_file_hash(root, export["path"], export["sha256"], f"{export.get('target')} export")
        atlas = export.get("atlas")
        if isinstance(atlas, dict):
            validate_file_hash(root, atlas["path"], atlas["sha256"], f"{export.get('target')} export atlas")
        for file_entry in export.get("files", []):
            validate_file_hash(root, file_entry["path"], file_entry["sha256"], f"{export.get('target')} export file")

    if manifest.get("status") != "accepted" or contract["assetKind"] != "icon-set":
        return

    icon_export = next((export for export in exports if export.get("target") == "icons"), None)
    require(icon_export is not None, "accepted icon-set requires icons export")
    atlas = read_json(root / icon_export["atlas"]["path"])
    manifest_frames = {frame["id"]: frame for frame in manifest["frames"]}
    atlas_frames = atlas.get("frames")
    require(isinstance(atlas_frames, list), "icon atlas frames must be a list")
    require(len(atlas_frames) == len(manifest_frames), "icon atlas frame count must match manifest")
    file_entries = {entry["id"]: entry for entry in icon_export.get("files", [])}
    require(set(file_entries) == set(manifest_frames), "icon export files must match manifest frame ids")

    for atlas_frame in atlas_frames:
        frame_id = atlas_frame.get("id")
        require(frame_id in manifest_frames, f"icon atlas references unknown frame id: {frame_id}")
        require(atlas_frame.get("rect") == manifest_frames[frame_id]["rect"], f"icon atlas frame rect mismatch for {frame_id}")
        file_entry = file_entries[frame_id]
        icon_path = root / file_entry["path"]
        with Image.open(icon_path) as image:
            require(image.mode == "RGBA", f"icon export {frame_id} must be RGBA")
            require(
                image.width == contract["geometry"]["cellWidth"] and image.height == contract["geometry"]["cellHeight"],
                f"icon export {frame_id} size must match contract cell",
            )

    phaser_export = next((export for export in exports if export.get("target") == "phaser"), None)
    pixi_export = next((export for export in exports if export.get("target") == "pixi"), None)
    aseprite_export = next((export for export in exports if export.get("target") == "aseprite"), None)
    require(phaser_export is not None, "accepted icon-set requires phaser export")
    require(pixi_export is not None, "accepted icon-set requires pixi export")
    require(aseprite_export is not None, "accepted icon-set requires aseprite export")

    phaser = read_json(root / phaser_export["path"])
    require(phaser["textures"][0].get("image") == "neutral/images/sheet.png", "phaser image path must point to neutral sheet")
    phaser_frames = phaser["textures"][0]["frames"]
    require(len(phaser_frames) == len(manifest_frames), "phaser frame count must match manifest")
    for frame in phaser_frames:
        frame_id = frame["filename"]
        require(frame_id in manifest_frames, f"phaser references unknown frame id: {frame_id}")
        require(frame["frame"] == manifest_frames[frame_id]["rect"], f"phaser frame rect mismatch for {frame_id}")

    pixi = read_json(root / pixi_export["path"])
    require(pixi["meta"].get("image") == "neutral/images/sheet.png", "pixi image path must point to neutral sheet")
    pixi_frames = pixi["frames"]
    require(set(pixi_frames) == set(manifest_frames), "pixi frame ids must match manifest")
    for frame_id, frame in pixi_frames.items():
        require(frame["frame"] == manifest_frames[frame_id]["rect"], f"pixi frame rect mismatch for {frame_id}")

    aseprite = read_json(root / aseprite_export["path"])
    require(aseprite["meta"].get("image") == "neutral/images/sheet.png", "aseprite image path must point to neutral sheet")
    require("frameTags" in aseprite["meta"], "aseprite frameTags are required")
    aseprite_frames = aseprite["frames"]
    require(len(aseprite_frames) == len(manifest_frames), "aseprite frame count must match manifest")
    for frame in aseprite_frames:
        frame_id = frame["filename"]
        require(frame_id in manifest_frames, f"aseprite references unknown frame id: {frame_id}")
        require(frame["frame"] == manifest_frames[frame_id]["rect"], f"aseprite frame rect mismatch for {frame_id}")
        require(frame["duration"] == manifest_frames[frame_id]["durationMs"], f"aseprite duration mismatch for {frame_id}")


def validate_frames(manifest: dict[str, Any], geometry: dict[str, Any]) -> None:
    rows = int(geometry["rows"])
    columns = int(geometry["columns"])
    cell_width = int(geometry["cellWidth"])
    cell_height = int(geometry["cellHeight"])
    expected_count = rows * columns
    frames = manifest.get("frames")
    require(isinstance(frames, list), "manifest.frames is required")
    require(len(frames) == expected_count, f"manifest.frames must contain {expected_count} frames")

    ids: set[str] = set()
    indexes: set[int] = set()
    rects: set[tuple[int, int, int, int]] = set()
    expected_rects = {
        (col * cell_width, row * cell_height, cell_width, cell_height)
        for row in range(rows)
        for col in range(columns)
    }
    for frame in frames:
        for key in ["id", "index", "rect", "sourceRect", "trimRect", "pivot", "durationMs"]:
            require(key in frame, f"manifest.frames[].{key} is required")
        ids.add(frame["id"])
        indexes.add(int(frame["index"]))
        rect = frame["rect"]
        rect_tuple = (int(rect["x"]), int(rect["y"]), int(rect["w"]), int(rect["h"]))
        rects.add(rect_tuple)

    require(len(ids) == expected_count, "manifest frame ids must be unique")
    require(indexes == set(range(expected_count)), "manifest frame indexes must be contiguous")
    require(rects == expected_rects, "manifest frame rects must cover each grid cell exactly once")

    for animation in manifest.get("animations", []):
        for frame_id in animation.get("frames", []):
            require(frame_id in ids, f"animation references missing frame id: {frame_id}")


def validate_semantic_coverage(contract: dict[str, Any], manifest: dict[str, Any]) -> None:
    kind = contract["assetKind"]
    frames = manifest["frames"]
    animations = manifest.get("animations", [])
    frame_ids = {frame["id"] for frame in frames}

    if kind == "object-state-sheet":
        animation_by_id = {animation.get("id"): animation for animation in animations}
        total_declared = 0
        for state in contract["semantics"]["states"]:
            state_id = state["id"]
            declared_frames = int(state["frames"])
            total_declared += declared_frames
            state_frames = [frame for frame in frames if frame.get("state") == state_id]
            require(len(state_frames) == declared_frames, f"state {state_id} must have {declared_frames} frame records")
            animation = animation_by_id.get(state_id)
            require(animation is not None, f"animation for state {state_id} is required")
            require(len(animation.get("frames", [])) == declared_frames, f"animation {state_id} frame count must match contract")
            require(set(animation["frames"]) == {frame["id"] for frame in state_frames}, f"animation {state_id} must reference exactly its state frames")
        require(total_declared == len(frames), "object state frame counts must cover every frame")

    elif kind == "icon-set":
        total_declared = 0
        for group in contract["semantics"]["groups"]:
            group_id = group["id"]
            declared_icons = int(group["iconCount"])
            total_declared += declared_icons
            group_frames = [frame for frame in frames if frame.get("state") == group_id]
            require(len(group_frames) == declared_icons, f"icon group {group_id} must have {declared_icons} frame records")
        require(total_declared == len(frames), "icon group counts must cover every frame")

    elif kind == "simple-vfx-sheet":
        phase_ranges: set[int] = set()
        for phase in contract["semantics"]["phases"]:
            phase_id = phase["id"]
            start = int(phase["startFrame"])
            end = int(phase["endFrame"])
            require(start <= end, f"phase {phase_id} startFrame must be <= endFrame")
            expected_indexes = set(range(start, end + 1))
            phase_ranges.update(expected_indexes)
            phase_frames = {int(frame["index"]) for frame in frames if frame.get("phase") == phase_id}
            require(phase_frames == expected_indexes, f"phase {phase_id} must cover frames {start}-{end}")
        require(phase_ranges == set(range(len(frames))), "VFX phases must cover every frame exactly once")
    elif kind == "character-action-sheet":
        directions = contract["semantics"]["directions"]
        action = contract["semantics"]["actions"][0]
        action_id = action["id"]
        declared_frames = int(action["frames"])
        animation_by_id = {animation.get("id"): animation for animation in animations}
        for direction in directions:
            direction_id = direction["id"]
            direction_frames = [frame for frame in frames if frame.get("direction") == direction_id and frame.get("action") == action_id]
            require(len(direction_frames) == declared_frames, f"character {action_id}/{direction_id} must have {declared_frames} frame records")
            animation_id = f"{action_id}_{direction_id}"
            animation = animation_by_id.get(animation_id)
            require(animation is not None, f"animation for {animation_id} is required")
            require(set(animation["frames"]) == {frame["id"] for frame in direction_frames}, f"animation {animation_id} must reference exactly its direction frames")

    for animation in animations:
        for frame_id in animation.get("frames", []):
            require(frame_id in frame_ids, f"animation references missing frame id: {frame_id}")


def validate_manifest(root: Path, contract: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
    kind = contract["assetKind"]
    require(manifest.get("assetKind") == kind, "manifest.assetKind must match contract.assetKind")
    require(manifest.get("assetId") == contract["assetId"], "manifest.assetId must match contract.assetId")
    require(manifest.get("validation", {}).get("profile") == contract["validation"]["profile"], "manifest validation profile must match contract")
    require("manifestHash" in manifest, "manifest.manifestHash is required")
    require(manifest["manifestHash"] == manifest_hash_value(manifest), "manifest.manifestHash does not match canonical manifest content")
    if manifest.get("status") == "accepted":
        require("packageHash" in manifest, "accepted manifest.packageHash is required")
        require(manifest["packageHash"] == package_hash_value(root, manifest), "manifest.packageHash does not match package content")

    validate_file_hash(root, require_key(manifest, "contractPath", "manifest"), require_key(manifest, "contractHash", "manifest"), "contract")

    generation = require_key(manifest, "generation", "manifest")
    for prompt in generation.get("prompts", []):
        validate_file_hash(root, prompt["path"], prompt["sha256"], "prompt")
    require(generation.get("prompts"), "manifest.generation.prompts is required")

    sources = manifest.get("sources")
    require(isinstance(sources, list) and sources, "manifest.sources is required")
    for source in sources:
        validate_file_hash(root, source["path"], source["sha256"], "source")
        validate_source_metadata(root, source)

    geometry = contract["geometry"]
    atlas_width = geometry["columns"] * geometry["cellWidth"]
    atlas_height = geometry["rows"] * geometry["cellHeight"]
    normalized_images = manifest.get("normalizedImages")
    require(isinstance(normalized_images, list) and normalized_images, "manifest.normalizedImages is required")
    first_image = normalized_images[0]
    validate_file_hash(root, first_image["path"], first_image["sha256"], "normalized image")
    expected_mode = "RGBA" if kind in PRODUCTION_KINDS else first_image.get("mode")
    validate_image(root / first_image["path"], atlas_width, atlas_height, expected_mode)
    if kind in PRODUCTION_KINDS and manifest.get("status") == "accepted":
        validate_production_image_content(root / first_image["path"], geometry)
        if kind == "object-state-sheet":
            validate_object_components(root / first_image["path"], geometry)
        if kind == "icon-set":
            validate_icon_family(root / first_image["path"], geometry)

    previews = manifest.get("previews")
    require(isinstance(previews, list) and previews, "manifest.previews is required")
    preview_ids = {preview.get("id") for preview in previews}
    require("contact-sheet" in preview_ids, "manifest.previews must include contact-sheet")
    require("preview" in preview_ids, "manifest.previews must include preview")
    for preview in previews:
        validate_file_hash(root, preview["path"], preview["sha256"], "preview")

    validation = manifest["validation"]
    for field in [
        ("validationPath", "validationHash", "validation"),
        ("diagnosticsPath", "diagnosticsHash", "diagnostics"),
        ("reviewPath", "reviewHash", "review"),
        ("exportEligibilityPath", "exportEligibilityHash", "export eligibility"),
    ]:
        validate_file_hash(root, validation[field[0]], validation[field[1]], field[2])
    if "exportConsistencyPath" in validation or "exportConsistencyHash" in validation:
        require("exportConsistencyPath" in validation and "exportConsistencyHash" in validation, "export consistency path and hash must be paired")
        validate_file_hash(root, validation["exportConsistencyPath"], validation["exportConsistencyHash"], "export consistency")
        consistency = read_json(root / validation["exportConsistencyPath"])
        require(consistency.get("canonical") == "asset.manifest.json", "export consistency canonical must be asset.manifest.json")
        require(consistency.get("frameCount") == len(manifest["frames"]), "export consistency frameCount mismatch")
    elif kind == "icon-set" and manifest.get("status") == "accepted":
        raise ValidationError("accepted icon-set requires export consistency report")

    validate_frames(manifest, geometry)
    validate_semantic_coverage(contract, manifest)
    return first_image


def validate_review(contract: dict[str, Any], manifest: dict[str, Any], review: dict[str, Any]) -> None:
    if contract["validation"].get("requiresHumanReview"):
        require(review, "qa/review.json is required")
    require(review.get("validationProfile") == contract["validation"]["profile"], "review validationProfile must match contract")
    require(review.get("manifestHash") == manifest.get("manifestHash"), "review manifestHash is stale")
    require(review.get("contractHash") == manifest.get("contractHash"), "review contractHash is stale")
    require(review.get("validationHash") == manifest["validation"].get("validationHash"), "review validationHash is stale")
    require(review.get("version") == manifest.get("version"), "review version is stale")
    normalized = manifest.get("normalizedImages", [{}])[0]
    require(review.get("normalizedImageHash") == normalized.get("sha256"), "review normalizedImageHash is stale")
    require(review.get("resolvedThresholdsHash"), "review resolvedThresholdsHash is required")
    require(review.get("decision") in {"accepted", "rejected", "needs-repair"}, "review decision is invalid")
    require(review.get("reviewSignature"), "review reviewSignature is required")
    require(review.get("reviewSignature") == sign_review(review), "review signature is invalid")


def validate_export_eligibility(manifest: dict[str, Any], validation_json: dict[str, Any], review: dict[str, Any], export_json: dict[str, Any]) -> None:
    level = export_json.get("level")
    target = export_json.get("targetDirectory", "")
    kind = manifest.get("assetKind")
    if level == "candidate":
        require(target.startswith("candidates/"), "candidate export must target candidates directory")
        require(not target.startswith("assets/"), "candidate export cannot target assets directory")
        require(not export_json.get("allowedExports"), "candidate export cannot allow production exports")
    elif level == "production-ready":
        require(kind in PRODUCTION_KINDS, f"{kind} cannot production export in v0")
        require(export_json.get("eligible") is True, "production-ready export must be eligible")
        require(manifest.get("status") == "accepted", "production-ready export requires accepted manifest")
        require(validation_json.get("result") == "pass", "production-ready export requires validation pass")
        require(review.get("decision") == "accepted", "production-ready export requires accepted review")
        require(target.startswith("assets/") or target.startswith("exports/"), "production-ready export must target assets or exports")
        require(export_json.get("allowedExports"), "production-ready export requires allowedExports")
    else:
        raise ValidationError(f"invalid export level: {level}")


def validate_fixture_dir(root: Path) -> dict[str, Any]:
    root = Path(root)
    contract = read_json(root / "contract.json")
    manifest = read_json(root / "asset.manifest.json")
    validation_json = read_json(root / manifest["validation"]["validationPath"])
    diagnostics_json = read_json(root / manifest["validation"]["diagnosticsPath"])
    review = read_json(root / manifest["validation"]["reviewPath"])
    export_json = read_json(root / manifest["validation"]["exportEligibilityPath"])

    validate_contract(contract)
    first_image = validate_manifest(root, contract, manifest)
    if contract["assetKind"] == "simple-vfx-sheet" and manifest.get("status") == "accepted":
        validate_vfx_metrics(root / first_image["path"], contract["geometry"], diagnostics_json)
    validate_review(contract, manifest, review)
    validate_export_eligibility(manifest, validation_json, review, export_json)
    validate_exports(root, contract, manifest)
    if validation_json.get("result") != "pass":
        require(review.get("decision") != "accepted", "failed or blocked validation cannot have accepted review")

    return {
        "fixture": str(root),
        "assetId": manifest["assetId"],
        "assetKind": manifest["assetKind"],
        "status": manifest["status"],
        "validationResult": validation_json["result"],
        "reviewDecision": review["decision"],
        "exportEligible": export_json["eligible"],
        "recommendedNextAction": diagnostics_json.get("recommendedNextAction"),
    }


def validate_fail_closed_case(root: Path) -> dict[str, Any]:
    root = Path(root)
    case_id = root.name
    payload = read_json(root / "input.json")
    expected = read_json(root / "expected.json")

    try:
        if case_id == "missing-contract":
            require(payload.get("runDirectory", {}).get("contract") is not None, "contract.json is required and asset kind must not be inferred")
        elif case_id == "missing-critical-field":
            validate_contract(payload["contract"])
        elif case_id == "profile-mismatch":
            validate_contract(payload["contract"])
        elif case_id == "stale-review":
            manifest = payload["manifest"]
            review = payload["review"]
            require(review.get("manifestHash") == manifest.get("manifestHash"), "review manifestHash does not match current manifestHash")
        elif case_id == "missing-alpha":
            image = payload["manifest"]["normalizedImages"][0]
            require(image.get("mode") == "RGBA", "normalized image must be RGBA")
        elif case_id == "bad-grid":
            geometry = payload["contract"]["geometry"]
            image = payload["manifest"]["normalizedImages"][0]
            require(image["width"] == geometry["columns"] * geometry["cellWidth"] and image["height"] == geometry["rows"] * geometry["cellHeight"], "normalized atlas dimensions do not match contract grid")
        elif case_id == "bad-review":
            decision = payload["review"].get("decision")
            require(decision == "accepted", "needs-repair review cannot become accepted or production export")
        elif case_id == "candidate-in-assets":
            export_json = payload["exportEligibility"]
            require(not (export_json.get("level") == "candidate" and export_json.get("targetDirectory", "").startswith("assets/")), "candidate export cannot target assets directory")
        elif case_id == "raw-game-ready-mixed":
            image = payload["manifest"]["normalizedImages"][0]
            require(not image.get("path", "").startswith("sources/"), "accepted neutral image path cannot point into sources")
        elif case_id == "repair-overwrites-parent":
            parent_path = payload["parent"]["path"]
            target_path = payload["repairAttempt"]["targetDirectory"]
            require(parent_path != target_path, "repair must create a new child candidate or version and never overwrite parent")
        elif case_id == "incomplete-manifest":
            validate_frames(payload["manifest"], payload["contract"]["geometry"])
        else:
            raise ValidationError(f"unknown fail-closed case: {case_id}")
    except ValidationError as exc:
        expected_reason = expected.get("blockingReason", "")
        require(expected.get("result") == "fail", f"{case_id} expected result must be fail")
        require(expected_reason in str(exc), f"{case_id} failed for wrong reason: {exc}")
        return {"case": case_id, "result": "expected-fail", "reason": str(exc)}

    raise ValidationError(f"{case_id} unexpectedly passed")


def run_acceptance(samples_root: Path) -> dict[str, Any]:
    samples_root = Path(samples_root)
    fixture_dirs = [
        samples_root / "magic-crystal-success",
        samples_root / "magic-crystal-detached-fail",
        samples_root / "potion-scale-fail",
        samples_root / "arcane-vfx-success",
        samples_root / "forest-tile-scope-guard",
    ]
    expected = {
        "magic-crystal-success": ("pass", True),
        "magic-crystal-detached-fail": ("fail", False),
        "potion-scale-fail": ("fail", False),
        "arcane-vfx-success": ("pass", True),
        "forest-tile-scope-guard": ("blocked", False),
    }
    fixtures = []
    for fixture_dir in fixture_dirs:
        result = validate_fixture_dir(fixture_dir)
        expected_validation, expected_export = expected[fixture_dir.name]
        require(result["validationResult"] == expected_validation, f"{fixture_dir.name} validation result mismatch")
        require(result["exportEligible"] is expected_export, f"{fixture_dir.name} export eligibility mismatch")
        fixtures.append(result)

    fail_closed = []
    for case_dir in sorted((samples_root / "fail-closed").iterdir()):
        if case_dir.is_dir():
            fail_closed.append(validate_fail_closed_case(case_dir))

    return {"fixtures": fixtures, "failClosed": fail_closed}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--acceptance", action="store_true")
    parser.add_argument("--allow-non-production", action="store_true")
    args = parser.parse_args(argv)
    try:
        result = run_acceptance(args.path) if args.acceptance else validate_fixture_dir(args.path)
        if not args.acceptance and not args.allow_non_production and not result.get("exportEligible"):
            raise ValidationError("asset is not production-ready")
        print(json.dumps({"ok": True, "result": result}, indent=2, ensure_ascii=False))
        return 0
    except (ValidationError, KeyError, TypeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
