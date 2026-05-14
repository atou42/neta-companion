#!/usr/bin/env python3
import argparse
import hashlib
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = "public/foundry/sprite-variants.json"
DEFAULT_CONTRACT = "public/foundry/sprite-production.json"
DISPLAYABLE_STATUSES = {"stable", "candidate"}
ALLOWED_STATUSES = DISPLAYABLE_STATUSES | {"archive"}


class CheckError(Exception):
    pass


def fail(message):
    raise CheckError(message)


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"Missing file: {path}")
    except json.JSONDecodeError as exc:
        fail(f"Invalid JSON in {path}: {exc}")


def rel_path(value, asset_root):
    path = Path(value)
    if path.is_absolute():
        fail(f"Path must be repository-relative: {value}")
    if ".." in path.parts:
        fail(f"Path must not leave the repository: {value}")
    return asset_root / path


def cli_path(value, asset_root=ROOT):
    path = Path(value)
    return path if path.is_absolute() else asset_root / path


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_pillow():
    if Image is None:
        fail("Pillow is required for image validation")


def validate_atlas(atlas, expected):
    keys = ["columns", "rows", "cellWidth", "cellHeight", "width", "height"]
    for key in keys:
        if not isinstance(atlas.get(key), int) or atlas[key] <= 0:
            fail(f"atlas.{key} must be a positive integer")
        if atlas[key] != expected[key]:
            fail(f"atlas.{key} is {atlas[key]}, expected {expected[key]}")


def validate_manifest(manifest_path, contract_path, asset_root):
    ensure_pillow()
    manifest = load_json(manifest_path)
    contract = load_json(contract_path)

    if manifest.get("schemaVersion") != "neta.sprite-variants.v1":
        fail("schemaVersion must be neta.sprite-variants.v1")
    if not isinstance(manifest.get("cacheVersion"), str) or not manifest["cacheVersion"].strip():
        fail("cacheVersion must be a non-empty string")
    if not isinstance(manifest.get("defaultVariant"), str) or not manifest["defaultVariant"].strip():
        fail("defaultVariant must be a non-empty string")

    variants = manifest.get("variants")
    if not isinstance(variants, list) or not variants:
        fail("variants must be a non-empty list")

    expected_atlas = contract.get("atlas") or {}
    seen_ids = set()
    default_seen = False
    displayable_count = 0
    results = []

    for index, variant in enumerate(variants):
        if not isinstance(variant, dict):
            fail(f"variants[{index}] must be an object")

        variant_id = variant.get("id")
        if not isinstance(variant_id, str) or not variant_id.strip():
            fail(f"variants[{index}].id must be a non-empty string")
        if variant_id in seen_ids:
            fail(f"Duplicate variant id: {variant_id}")
        seen_ids.add(variant_id)
        if variant_id == manifest["defaultVariant"]:
            default_seen = True

        status = variant.get("status")
        if status not in ALLOWED_STATUSES:
            fail(f"{variant_id}.status must be one of {sorted(ALLOWED_STATUSES)}")
        if status in DISPLAYABLE_STATUSES:
            displayable_count += 1

        for key in ["label", "sheet", "contract", "hash", "version"]:
            if not isinstance(variant.get(key), str) or not variant[key].strip():
                fail(f"{variant_id}.{key} must be a non-empty string")

        contract_value = variant["contract"]
        if rel_path(contract_value, asset_root).resolve() != contract_path.resolve():
            fail(f"{variant_id}.contract must point to {contract_path.relative_to(asset_root)}")

        sheet_path = rel_path(variant["sheet"], asset_root)
        if not sheet_path.is_file():
            fail(f"{variant_id}.sheet does not exist: {variant['sheet']}")

        validate_atlas(variant.get("atlas") or {}, expected_atlas)

        declared_hash = variant["hash"]
        if not declared_hash.startswith("sha256-") or len(declared_hash) != len("sha256-") + 64:
            fail(f"{variant_id}.hash must use sha256-<64 hex chars>")
        actual_hash = sha256_file(sheet_path)
        if declared_hash.removeprefix("sha256-") != actual_hash:
            fail(f"{variant_id}.hash mismatch: expected {declared_hash}, got sha256-{actual_hash}")

        with Image.open(sheet_path) as image:
            if image.size != (expected_atlas["width"], expected_atlas["height"]):
                fail(f"{variant_id}.sheet is {image.size}, expected {(expected_atlas['width'], expected_atlas['height'])}")

        results.append({
            "id": variant_id,
            "status": status,
            "sheet": variant["sheet"],
            "hash": declared_hash,
        })

    if not default_seen:
        fail(f"defaultVariant is not listed: {manifest['defaultVariant']}")
    if displayable_count < 1:
        fail("At least one stable or candidate variant is required")

    return {
        "ok": True,
        "manifest": str(manifest_path.relative_to(asset_root)),
        "defaultVariant": manifest["defaultVariant"],
        "displayableVariants": displayable_count,
        "variants": results,
    }


def main():
    parser = argparse.ArgumentParser(description="Validate Neta Companion sprite variant manifest.")
    parser.add_argument("--asset-root", default=".", help="Static asset root that manifest paths are relative to.")
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    parser.add_argument("--contract", default=DEFAULT_CONTRACT)
    args = parser.parse_args()

    try:
        asset_root = cli_path(args.asset_root).resolve()
        result = validate_manifest(
            cli_path(args.manifest, asset_root),
            cli_path(args.contract, asset_root),
            asset_root,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except CheckError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
