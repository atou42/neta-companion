#!/usr/bin/env python3
import argparse
import json
import shutil
import sys
from pathlib import Path
from math import sqrt

try:
    from PIL import Image
except ImportError:
    Image = None


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONTRACT = ROOT / "public/foundry/sprite-production.json"


class CheckError(Exception):
    pass


def fail(message):
    raise CheckError(message)


def load_json(path):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        fail(f"Missing file: {path}")
    except json.JSONDecodeError as exc:
        fail(f"Invalid JSON in {path}: {exc}")


def rel_path(value):
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def validate_contract(contract):
    if contract.get("schemaVersion") != "neta.sprite-production.contract.v1":
        fail("Contract schemaVersion must be neta.sprite-production.contract.v1")

    atlas = contract.get("atlas") or {}
    required_atlas = ["columns", "rows", "cellWidth", "cellHeight", "width", "height"]
    for key in required_atlas:
        if not isinstance(atlas.get(key), int) or atlas[key] <= 0:
            fail(f"Contract atlas.{key} must be a positive integer")

    if atlas["columns"] * atlas["cellWidth"] != atlas["width"]:
        fail("Contract atlas width does not match columns * cellWidth")
    if atlas["rows"] * atlas["cellHeight"] != atlas["height"]:
        fail("Contract atlas height does not match rows * cellHeight")

    states = contract.get("states")
    if not isinstance(states, list) or len(states) != atlas["rows"]:
        fail("Contract states must contain one entry per atlas row")

    seen_rows = set()
    for state in states:
        row = state.get("row")
        if row in seen_rows:
            fail(f"Duplicate state row: {row}")
        seen_rows.add(row)
        if not isinstance(row, int) or row < 0 or row >= atlas["rows"]:
            fail(f"Invalid state row: {row}")
        if not state.get("name"):
            fail(f"State row {row} is missing a name")
        if not isinstance(state.get("frames"), int) or state["frames"] <= 0 or state["frames"] > atlas["columns"]:
            fail(f"State row {row} has invalid frame count")

    background = contract.get("background") or {}
    primary_hex = ((background.get("primary") or {}).get("hex") or "").upper()
    if not primary_hex.startswith("#") or len(primary_hex) != 7:
        fail("Contract background.primary.hex must be a hex color")

    target = contract.get("target") or {}
    if not target.get("publicSheet"):
        fail("Contract target.publicSheet is required")


def ensure_pillow():
    if Image is None:
        fail("Pillow is required for image validation. Install it before validating sprites.")


def inspect_sheet(sheet_path, contract, strict_quality=False):
    ensure_pillow()
    if not sheet_path.exists():
        fail(f"Missing spritesheet: {sheet_path}")

    atlas = contract["atlas"]
    with Image.open(sheet_path) as image:
        image = image.convert("RGBA")
        if image.size != (atlas["width"], atlas["height"]):
            fail(f"{sheet_path} is {image.size}, expected {(atlas['width'], atlas['height'])}")

        pixels = image.load()
        white_edge_total = 0
        alpha_pixels = 0
        opaque_pixels = 0

        for y in range(image.height):
            for x in range(image.width):
                r, g, b, a = pixels[x, y]
                if a:
                    alpha_pixels += 1
                if a == 255:
                    opaque_pixels += 1
                if 0 < a < 255 and r > 220 and g > 220 and b > 220:
                    left_clear = x == 0 or pixels[x - 1, y][3] == 0
                    right_clear = x == image.width - 1 or pixels[x + 1, y][3] == 0
                    up_clear = y == 0 or pixels[x, y - 1][3] == 0
                    down_clear = y == image.height - 1 or pixels[x, y + 1][3] == 0
                    if left_clear or right_clear or up_clear or down_clear:
                        white_edge_total += 1

        frames = atlas["columns"] * atlas["rows"]
        white_edge_per_frame = white_edge_total / frames
        limit = (contract.get("qualityGate") or {}).get("maxSemiTransparentWhiteEdgePixelsPerFrame")

        if strict_quality and limit is not None and white_edge_per_frame > float(limit):
            fail(
                f"Semi-transparent white edge pixels average {white_edge_per_frame:.1f}/frame, "
                f"limit is {limit}/frame"
            )

        return {
            "path": str(sheet_path.relative_to(ROOT) if sheet_path.is_relative_to(ROOT) else sheet_path),
            "size": list(image.size),
            "alphaPixels": alpha_pixels,
            "opaquePixels": opaque_pixels,
            "semiTransparentWhiteEdgePixels": white_edge_total,
            "semiTransparentWhiteEdgePixelsPerFrame": round(white_edge_per_frame, 2),
        }


def parse_hex_color(value):
    value = (value or "").strip()
    if not value.startswith("#") or len(value) != 7:
        fail(f"Invalid chroma key hex color: {value or '<missing>'}")
    try:
        return tuple(int(value[index:index + 2], 16) for index in (1, 3, 5))
    except ValueError:
        fail(f"Invalid chroma key hex color: {value}")


def inspect_provider_source(source_path, key_hex, contract):
    ensure_pillow()
    key_rgb = parse_hex_color(key_hex)
    min_coverage = float((contract.get("qualityGate") or {}).get("minChromaKeyCoverageInProviderSource", 0.05))
    key_threshold = float((contract.get("qualityGate") or {}).get("providerChromaKeyDistanceThreshold", 32))

    try:
        with Image.open(source_path) as image:
            image = image.convert("RGBA")
            total = image.width * image.height
            key_pixels = 0
            transparent_pixels = 0
            pixels = image.load()

            for y in range(image.height):
                for x in range(image.width):
                    r, g, b, a = pixels[x, y]
                    if a < 255:
                        transparent_pixels += 1
                    distance = sqrt((r - key_rgb[0]) ** 2 + (g - key_rgb[1]) ** 2 + (b - key_rgb[2]) ** 2)
                    if a == 255 and distance <= key_threshold:
                        key_pixels += 1

            key_coverage = key_pixels / total if total else 0
            if transparent_pixels:
                fail(f"Provider source must be opaque chroma-key art, not transparent: {source_path}")
            if key_coverage < min_coverage:
                fail(
                    f"Provider source {source_path} has {key_coverage:.2%} chroma-key pixels within distance {key_threshold:g}, "
                    f"minimum is {min_coverage:.2%}"
                )

            return {
                "path": str(source_path),
                "size": list(image.size),
                "chromaKeyCoverage": round(key_coverage, 4),
                "chromaKeyDistanceThreshold": key_threshold,
            }
    except OSError as exc:
        fail(f"Provider source is not a readable image: {source_path}: {exc}")


def validate_manifest(run_dir, contract):
    manifest_path = run_dir / "sprite-production-manifest.json"
    manifest = load_json(manifest_path)

    if manifest.get("schemaVersion") != "neta.sprite-production.run.v1":
        fail("Run manifest schemaVersion must be neta.sprite-production.run.v1")
    if manifest.get("productionMode") is not True:
        fail("Run manifest productionMode must be true")

    background = manifest.get("sourceBackground") or {}
    if background.get("kind") != "chroma-key":
        fail("Run sourceBackground.kind must be chroma-key")

    allowed_keys = [((contract.get("background") or {}).get("primary") or {}).get("hex")]
    allowed_keys.extend(item.get("hex") for item in (contract.get("background") or {}).get("fallbacks", []))
    allowed_keys = {key.upper() for key in allowed_keys if key}
    key_hex = (background.get("hex") or "").upper()
    if key_hex not in allowed_keys:
        fail(f"Run chroma key {key_hex or '<missing>'} is not allowed by the contract")

    prompts = manifest.get("sourcePrompts") or []
    prompt_text = "\n".join(str(prompt).lower() for prompt in prompts)
    for phrase in (contract.get("background") or {}).get("forbiddenPromptPhrases", []):
        if phrase.lower() in prompt_text:
            fail(f"Run prompt contains forbidden source phrase: {phrase}")

    provider_sources = manifest.get("providerSources")
    if not isinstance(provider_sources, list) or not provider_sources:
        fail("Run manifest providerSources must list real provider originals")
    provider_stats = []
    for source in provider_sources:
        source_path = run_dir / source
        if not source_path.exists():
            fail(f"Provider source is missing: {source_path}")
        provider_stats.append(inspect_provider_source(source_path, key_hex, contract))

    qa = manifest.get("qa") or {}
    for key in ["composites", "playback"]:
        values = qa.get(key)
        if not isinstance(values, list) or not values:
            fail(f"Run manifest qa.{key} must list generated QA files")
        for value in values:
            if not (run_dir / value).exists():
                fail(f"QA file is missing: {run_dir / value}")

    required_composites = (contract.get("qualityGate") or {}).get("requiredComposites") or []
    composite_names = " ".join(str(value).lower() for value in qa.get("composites") or [])
    for required in required_composites:
        if str(required).lower() not in composite_names:
            fail(f"Run manifest qa.composites must include a {required} composite")

    final_sheet = manifest.get("finalSheet")
    if not final_sheet:
        fail("Run manifest finalSheet is required")

    manifest["_providerStats"] = provider_stats
    return manifest, run_dir / final_sheet


def promote_sheet(sheet_path, contract):
    targets = contract["target"]
    for key in ["publicSheet", "distSheet"]:
        target = rel_path(targets[key])
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(sheet_path, target)
        print(f"promoted {sheet_path} -> {target}")


def main():
    parser = argparse.ArgumentParser(description="Validate Neta Companion sprite production assets.")
    parser.add_argument("--contract", default=str(DEFAULT_CONTRACT))
    parser.add_argument("--sheet")
    parser.add_argument("--run-dir")
    parser.add_argument("--contract-only", action="store_true", help="Validate only the production contract.")
    parser.add_argument("--asset-only", action="store_true", help="Validate only contract and sheet dimensions.")
    parser.add_argument("--strict", action="store_true", help="Require production run provenance and stricter quality checks.")
    parser.add_argument("--promote", action="store_true", help="Copy a validated run final sheet to public and dist targets.")
    args = parser.parse_args()

    try:
        contract_path = rel_path(args.contract)
        contract = load_json(contract_path)
        validate_contract(contract)

        if args.contract_only:
            result = {
                "ok": True,
                "mode": "contract-only",
                "contract": str(contract_path.relative_to(ROOT) if contract_path.is_relative_to(ROOT) else contract_path),
                "atlas": contract["atlas"],
                "states": [state["name"] for state in contract["states"]],
            }
        elif args.run_dir:
            run_dir = rel_path(args.run_dir)
            manifest, sheet_path = validate_manifest(run_dir, contract)
            stats = inspect_sheet(sheet_path, contract, strict_quality=args.strict)
            if args.promote:
                promote_sheet(sheet_path, contract)
            result = {
                "ok": True,
                "mode": "production-run",
                "runDir": str(run_dir),
                "chromaKey": manifest["sourceBackground"]["hex"],
                "providerSources": manifest["_providerStats"],
                "sheet": stats,
            }
        else:
            if args.strict and not args.asset_only:
                fail("--strict requires --run-dir unless --asset-only is set")
            sheet_path = rel_path(args.sheet) if args.sheet else rel_path(contract["target"]["publicSheet"])
            stats = inspect_sheet(sheet_path, contract, strict_quality=False)
            result = {
                "ok": True,
                "mode": "asset-only",
                "note": "Asset-only validation checks shape and alpha stats. It does not prove production provenance.",
                "sheet": stats,
            }

        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except CheckError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
