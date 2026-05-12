from __future__ import annotations

import argparse
import copy
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from PIL import Image

from .faithful_pet import ATLAS, HATCH_PET_DIR, ROWS, rows_from_upstream_reference
from .validator import canonical_json, sha256_text


ASSET_KIND = "companion"
SOURCE_PROFILE = "codex-pet"
CODEX_EXPORT_PROFILE = "codex-pet"
CONTRACT_SCHEMA = "pet-foundry.companion.contract.v0"
MANIFEST_SCHEMA = "pet-foundry.companion.manifest.v0"
VALIDATION_SCHEMA = "pet-foundry.companion.validation.v0"
VALIDATION_PROFILE = "companion.v0"
COMPANION_EXPORT_SCHEMA = "pet-foundry.companion.v0"


class HatchPetBridgeError(Exception):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise HatchPetBridgeError(message)


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise HatchPetBridgeError(f"missing json: {path}") from exc
    except json.JSONDecodeError as exc:
        raise HatchPetBridgeError(f"invalid json: {path}: {exc}") from exc


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def stable_rel(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def manifest_hash_value(manifest: dict[str, Any]) -> str:
    stable = copy.deepcopy(manifest)
    stable.pop("manifestHash", None)
    stable.pop("packageHash", None)
    return sha256_text(canonical_json(stable))


def package_hash_value(root: Path, manifest: dict[str, Any]) -> str:
    entries: list[tuple[str, str]] = []
    for file_path in sorted(path for path in root.rglob("*") if path.is_file()):
        rel = file_path.relative_to(root).as_posix()
        if rel == "asset.manifest.json":
            continue
        entries.append((rel, sha256_file(file_path)))
    stable = copy.deepcopy(manifest)
    stable.pop("packageHash", None)
    entries.append(("asset.manifest.json", sha256_text(canonical_json(stable))))
    entries.sort()
    return sha256_text(canonical_json(entries))


def animation_duration_specs() -> dict[str, str]:
    path = HATCH_PET_DIR / "references" / "animation-rows.md"
    specs: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("| "):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) >= 4 and cells[0].isdigit():
            specs[cells[1]] = cells[3]
    return specs


def used_cell_specs() -> list[dict[str, Any]]:
    duration_specs = animation_duration_specs()
    return [
        {
            "id": state,
            "row": row,
            "frames": frames,
            "durationSpec": duration_specs.get(state, ""),
            "loop": True,
        }
        for state, row, frames in ROWS
    ]


def assert_package_path(root: Path, rel_path: str) -> Path:
    require(isinstance(rel_path, str) and rel_path, "package path is required")
    require("://" not in rel_path and not rel_path.startswith("/") and "\x00" not in rel_path, f"external path is not allowed: {rel_path}")
    resolved = (root / rel_path).resolve()
    require(resolved == root.resolve() or root.resolve() in resolved.parents, f"path escapes package: {rel_path}")
    return resolved


def alpha_nonzero(image: Image.Image) -> int:
    alpha = image.convert("RGBA").getchannel("A")
    return sum(alpha.histogram()[1:])


def validate_spritesheet(path: Path) -> dict[str, Any]:
    require(path.is_file(), f"missing spritesheet: {path}")
    with Image.open(path) as opened:
        rgba = opened.convert("RGBA")
        require(rgba.size == (ATLAS["width"], ATLAS["height"]), f"spritesheet size {rgba.width}x{rgba.height} != {ATLAS['width']}x{ATLAS['height']}")
        errors: list[str] = []
        for state, row, frames in ROWS:
            for column in range(frames):
                box = (
                    column * ATLAS["cell_width"],
                    row * ATLAS["cell_height"],
                    (column + 1) * ATLAS["cell_width"],
                    (row + 1) * ATLAS["cell_height"],
                )
                if alpha_nonzero(rgba.crop(box)) == 0:
                    errors.append(f"{state} frame {column:02d} is empty")
            for column in range(frames, ATLAS["columns"]):
                box = (
                    column * ATLAS["cell_width"],
                    row * ATLAS["cell_height"],
                    (column + 1) * ATLAS["cell_width"],
                    (row + 1) * ATLAS["cell_height"],
                )
                if alpha_nonzero(rgba.crop(box)) != 0:
                    errors.append(f"{state} unused cell {column:02d} is not transparent")
        require(not errors, "; ".join(errors))
        return {
            "path": str(path),
            "width": rgba.width,
            "height": rgba.height,
            "mode": rgba.mode,
            "format": opened.format,
            "sha256": sha256_file(path),
        }


def validate_hatch_pet_run(run_dir: Path, *, allow_synthetic_sources: bool = False) -> dict[str, Any]:
    run_dir = run_dir.resolve()
    request = read_json(run_dir / "pet_request.json")
    jobs_manifest = read_json(run_dir / "imagegen-jobs.json")
    review = read_json(run_dir / "qa/review.json")
    upstream_validation = read_json(run_dir / "final/validation.json")

    for key in ["pet_id", "display_name", "description"]:
        require(isinstance(request.get(key), str) and request[key], f"pet_request.json.{key} is required")

    require(ROWS == rows_from_upstream_reference(), "local pet rows drifted from upstream hatch-pet reference")
    jobs = jobs_manifest.get("jobs")
    require(isinstance(jobs, list), "imagegen-jobs.json.jobs must be a list")
    by_id = {job.get("id"): job for job in jobs if isinstance(job, dict)}
    required_ids = {"base", *[state for state, _row, _frames in ROWS]}
    require(required_ids <= set(by_id), "imagegen-jobs.json is missing required pet jobs")
    for job_id in sorted(required_ids):
        job = by_id[job_id]
        require(job.get("status") == "complete", f"job {job_id} is not complete")
        require(isinstance(job.get("source_sha256"), str) and job["source_sha256"], f"job {job_id} is missing source_sha256")
        if not allow_synthetic_sources:
            require(not job.get("synthetic_test_source"), f"job {job_id} uses a synthetic test source")
    base = by_id["base"]
    has_canonical_base = base.get("canonical_reference_path") or (run_dir / "references/canonical-base.png").is_file()
    if not has_canonical_base and allow_synthetic_sources:
        has_canonical_base = (run_dir / "decoded/base.png").is_file()
    require(has_canonical_base, "canonical base reference is required")

    require(review.get("ok") is True, "hatch-pet review did not pass")
    require(upstream_validation.get("ok") is True, "hatch-pet atlas validation did not pass")
    sheet_info = validate_spritesheet(run_dir / "final/spritesheet.webp")
    require((run_dir / "qa/contact-sheet.png").is_file(), "contact sheet is required")
    return {
        "ok": True,
        "runDir": str(run_dir),
        "petId": request["pet_id"],
        "displayName": request["display_name"],
        "description": request["description"],
        "jobs": sorted(required_ids),
        "spritesheet": sheet_info,
        "review": str(run_dir / "qa/review.json"),
        "upstreamValidation": str(run_dir / "final/validation.json"),
        "contactSheet": str(run_dir / "qa/contact-sheet.png"),
    }


def copy_if_exists(source: Path, target: Path) -> str | None:
    if not source.exists():
        return None
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)
    else:
        shutil.copy2(source, target)
    return str(target)


def build_contract(request: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": CONTRACT_SCHEMA,
        "assetKind": ASSET_KIND,
        "assetId": request["pet_id"],
        "displayName": request["display_name"],
        "description": request["description"],
        "stylePreset": "codex-digital-pet",
        "targetUse": "runtime-assistant-pet",
        "validation": {"profile": VALIDATION_PROFILE, "requiresHumanReview": True},
        "geometry": {
            "columns": ATLAS["columns"],
            "rows": ATLAS["rows"],
            "cellWidth": ATLAS["cell_width"],
            "cellHeight": ATLAS["cell_height"],
            "width": ATLAS["width"],
            "height": ATLAS["height"],
            "background": {"mode": "transparent"},
        },
        "semantics": {"states": used_cell_specs()},
        "sourceProfile": SOURCE_PROFILE,
        "sourceContract": {
            "strategy": "hatch-pet-base-first-grounded-row-strips",
            "canonicalBaseRequired": True,
            "rowStripGenerationRequired": True,
            "directFullAtlasGeneration": "adversarial-only",
        },
    }


def build_runtime_pet_manifest(request: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": request["pet_id"],
        "displayName": request["display_name"],
        "description": request["description"],
        "spritesheetPath": "spritesheet.webp",
    }


def build_companion_manifest(request: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": COMPANION_EXPORT_SCHEMA,
        "id": request["pet_id"],
        "displayName": request["display_name"],
        "description": request["description"],
        "sourceProfile": SOURCE_PROFILE,
        "atlas": {
            "image": "spritesheet.webp",
            "columns": ATLAS["columns"],
            "rows": ATLAS["rows"],
            "cellWidth": ATLAS["cell_width"],
            "cellHeight": ATLAS["cell_height"],
            "width": ATLAS["width"],
            "height": ATLAS["height"],
        },
        "states": used_cell_specs(),
        "runtimeHints": {
            "agentNeutral": True,
            "stateMachine": True,
            "notes": "Use declared row/frame metadata. Do not infer hidden rows or substitute missing states silently.",
        },
    }


def build_companion_asset_package_from_hatch_pet_run(
    run_dir: Path,
    output_dir: Path,
    *,
    allow_synthetic_sources: bool = False,
) -> dict[str, Any]:
    run_dir = run_dir.expanduser().resolve()
    output_dir = output_dir.expanduser().resolve()
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"output directory already exists and is not empty: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        validation_summary = validate_hatch_pet_run(run_dir, allow_synthetic_sources=allow_synthetic_sources)
        request = read_json(run_dir / "pet_request.json")
        contract = build_contract(request)
        write_json(output_dir / "contract.json", contract)

        copy_if_exists(run_dir / "pet_request.json", output_dir / "sources/hatch-pet/pet_request.json")
        copy_if_exists(run_dir / "imagegen-jobs.json", output_dir / "sources/hatch-pet/imagegen-jobs.json")
        canonical_source = run_dir / "references/canonical-base.png"
        if not canonical_source.is_file() and allow_synthetic_sources:
            canonical_source = run_dir / "decoded/base.png"
        copy_if_exists(canonical_source, output_dir / "sources/hatch-pet/canonical-base.png")
        copy_if_exists(run_dir / "decoded", output_dir / "sources/hatch-pet/decoded")
        copy_if_exists(run_dir / "prompts", output_dir / "sources/hatch-pet/prompts")
        copy_if_exists(run_dir / "frames/frames-manifest.json", output_dir / "sources/hatch-pet/frames-manifest.json")

        spritesheet = output_dir / "neutral/images/spritesheet.webp"
        spritesheet.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(run_dir / "final/spritesheet.webp", spritesheet)
        copy_if_exists(run_dir / "final/spritesheet.png", output_dir / "neutral/images/spritesheet.png")

        write_json(
            output_dir / "neutral/data/atlas.json",
            {
                "schemaVersion": "pet-foundry.companion-atlas.v0",
                "assetId": request["pet_id"],
                "image": "neutral/images/spritesheet.webp",
                "geometry": contract["geometry"],
                "states": contract["semantics"]["states"],
                "sourceProfile": SOURCE_PROFILE,
            },
        )
        write_json(
            output_dir / "neutral/data/animations.json",
            {
                "schemaVersion": "pet-foundry.companion-animations.v0",
                "assetId": request["pet_id"],
                "animations": contract["semantics"]["states"],
                "sourceProfile": SOURCE_PROFILE,
            },
        )
        write_json(
            output_dir / "neutral/data/import-hints.json",
            {
                "schemaVersion": "asset-forge.import-hints.v1",
                "assetId": request["pet_id"],
                "targets": ["companion", CODEX_EXPORT_PROFILE],
                "agentNeutralExport": "exports/companion/",
                "profileExports": {
                    CODEX_EXPORT_PROFILE: {
                        "path": "exports/codex-pet/",
                        "copyExportDirectoryTo": "${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/",
                    }
                },
            },
        )

        export_dir = output_dir / "exports/codex-pet"
        export_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(spritesheet, export_dir / "spritesheet.webp")
        write_json(export_dir / "pet.json", build_runtime_pet_manifest(request))

        companion_export_dir = output_dir / "exports/companion"
        companion_export_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(spritesheet, companion_export_dir / "spritesheet.webp")
        write_json(companion_export_dir / "companion.json", build_companion_manifest(request))

        copy_if_exists(run_dir / "qa/contact-sheet.png", output_dir / "previews/contact-sheet.png")
        copy_if_exists(run_dir / "qa/videos", output_dir / "previews/videos")
        copy_if_exists(run_dir / "qa/review.json", output_dir / "qa/hatch-pet-review.json")
        copy_if_exists(run_dir / "final/validation.json", output_dir / "qa/hatch-pet-validation.json")

        validation = {
            "schemaVersion": VALIDATION_SCHEMA,
            "profile": VALIDATION_PROFILE,
            "result": "pass",
            "status": "loadable-candidate",
            "sourceProfile": SOURCE_PROFILE,
            "checks": validation_summary,
        }
        write_json(output_dir / "qa/validation.json", validation)
        export_eligibility = {
            "assetId": request["pet_id"],
            "level": "loadable-candidate",
            "eligible": True,
            "allowedExports": ["companion", CODEX_EXPORT_PROFILE],
            "targetDirectory": "exports/",
            "blockingReasons": [],
        }
        write_json(output_dir / "qa/export-eligibility.json", export_eligibility)

        manifest = {
            "schemaVersion": MANIFEST_SCHEMA,
            "assetKind": ASSET_KIND,
            "assetId": request["pet_id"],
            "displayName": request["display_name"],
            "status": "loadable-candidate",
            "sourceProfile": SOURCE_PROFILE,
            "manifestHash": "pending",
            "contractPath": "contract.json",
            "contractHash": sha256_file(output_dir / "contract.json"),
            "generation": {
                "strategy": "hatch-pet-base-first-grounded-row-strips",
                "sourceProfile": SOURCE_PROFILE,
                "sourceRunDir": str(run_dir),
                "canonicalBase": "sources/hatch-pet/canonical-base.png",
                "jobManifest": "sources/hatch-pet/imagegen-jobs.json",
            },
            "sources": [
                {"id": "hatch-pet-request", "path": "sources/hatch-pet/pet_request.json", "sha256": sha256_file(output_dir / "sources/hatch-pet/pet_request.json")},
                {"id": "hatch-pet-jobs", "path": "sources/hatch-pet/imagegen-jobs.json", "sha256": sha256_file(output_dir / "sources/hatch-pet/imagegen-jobs.json")},
            ],
            "normalizedImages": [
                {"id": "spritesheet", "path": "neutral/images/spritesheet.webp", "sha256": sha256_file(spritesheet), "width": ATLAS["width"], "height": ATLAS["height"], "mode": "RGBA"}
            ],
            "data": [
                {"id": "atlas", "path": "neutral/data/atlas.json", "sha256": sha256_file(output_dir / "neutral/data/atlas.json")},
                {"id": "animations", "path": "neutral/data/animations.json", "sha256": sha256_file(output_dir / "neutral/data/animations.json")},
                {"id": "import-hints", "path": "neutral/data/import-hints.json", "sha256": sha256_file(output_dir / "neutral/data/import-hints.json")},
            ],
            "previews": [
                {"id": "contact-sheet", "path": "previews/contact-sheet.png", "sha256": sha256_file(output_dir / "previews/contact-sheet.png")},
            ],
            "validation": {
                "profile": VALIDATION_PROFILE,
                "validationPath": "qa/validation.json",
                "validationHash": sha256_file(output_dir / "qa/validation.json"),
                "hatchPetReviewPath": "qa/hatch-pet-review.json",
                "hatchPetReviewHash": sha256_file(output_dir / "qa/hatch-pet-review.json"),
                "hatchPetValidationPath": "qa/hatch-pet-validation.json",
                "hatchPetValidationHash": sha256_file(output_dir / "qa/hatch-pet-validation.json"),
                "exportEligibilityPath": "qa/export-eligibility.json",
                "exportEligibilityHash": sha256_file(output_dir / "qa/export-eligibility.json"),
            },
            "exports": [
                {"target": "companion", "path": "exports/companion/", "files": ["companion.json", "spritesheet.webp"]},
                {"target": "codex-pet", "path": "exports/codex-pet/", "files": ["pet.json", "spritesheet.webp"]},
            ],
        }
        manifest["manifestHash"] = manifest_hash_value(manifest)
        write_json(output_dir / "asset.manifest.json", manifest)
        manifest["packageHash"] = package_hash_value(output_dir, manifest)
        write_json(output_dir / "asset.manifest.json", manifest)
        return manifest
    except Exception:
        if output_dir.exists():
            shutil.rmtree(output_dir)
        raise


def validate_companion_asset_package(root: Path) -> dict[str, Any]:
    root = root.expanduser().resolve()
    manifest = read_json(root / "asset.manifest.json")
    contract = read_json(root / "contract.json")
    require(manifest.get("schemaVersion") == MANIFEST_SCHEMA, "asset.manifest.json schemaVersion is invalid")
    require(contract.get("schemaVersion") == CONTRACT_SCHEMA, "contract.json schemaVersion is invalid")
    require(manifest.get("assetKind") == ASSET_KIND, "manifest.assetKind must be companion")
    require(contract.get("assetKind") == ASSET_KIND, "contract.assetKind must be companion")
    require(manifest.get("sourceProfile") == SOURCE_PROFILE, "manifest.sourceProfile must record codex-pet source profile")
    require(contract.get("sourceProfile") == SOURCE_PROFILE, "contract.sourceProfile must record codex-pet source profile")
    require(manifest.get("manifestHash") == manifest_hash_value(manifest), "manifestHash does not match manifest content")
    require(manifest.get("packageHash") == package_hash_value(root, manifest), "packageHash does not match package content")
    for entry in manifest.get("sources", []) + manifest.get("normalizedImages", []) + manifest.get("data", []) + manifest.get("previews", []):
        path = assert_package_path(root, entry["path"])
        require(path.is_file(), f"missing package file: {entry['path']}")
        require(entry.get("sha256") == sha256_file(path), f"hash mismatch: {entry['path']}")
    validation = read_json(assert_package_path(root, manifest["validation"]["validationPath"]))
    export_eligibility = read_json(assert_package_path(root, manifest["validation"]["exportEligibilityPath"]))
    pet_manifest = read_json(root / "exports/codex-pet/pet.json")
    companion_manifest = read_json(root / "exports/companion/companion.json")
    require(validation.get("result") == "pass", "package validation must pass")
    require(export_eligibility.get("eligible") is True, "companion export must be eligible")
    require(pet_manifest.get("spritesheetPath") == "spritesheet.webp", "pet.json must reference local spritesheet.webp")
    require(companion_manifest.get("schemaVersion") == COMPANION_EXPORT_SCHEMA, "companion.json schemaVersion is invalid")
    require(companion_manifest.get("sourceProfile") == SOURCE_PROFILE, "companion export must record its source profile")
    require(companion_manifest.get("atlas", {}).get("image") == "spritesheet.webp", "companion.json must reference local spritesheet.webp")
    validate_spritesheet(root / "exports/codex-pet/spritesheet.webp")
    validate_spritesheet(root / "exports/companion/spritesheet.webp")
    validate_spritesheet(root / "neutral/images/spritesheet.webp")
    return {
        "ok": True,
        "assetId": manifest["assetId"],
        "status": manifest["status"],
        "export": str(root / "exports"),
    }


build_asset_package_from_hatch_pet_run = build_companion_asset_package_from_hatch_pet_run
validate_hatch_pet_asset_package = validate_companion_asset_package


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build")
    build.add_argument("--run-dir", required=True, type=Path)
    build.add_argument("--output-dir", required=True, type=Path)
    build.add_argument("--allow-synthetic-sources", action="store_true")
    validate = sub.add_parser("validate")
    validate.add_argument("package_dir", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "build":
            manifest = build_companion_asset_package_from_hatch_pet_run(args.run_dir, args.output_dir, allow_synthetic_sources=args.allow_synthetic_sources)
            print(json.dumps({"ok": True, "assetId": manifest["assetId"], "packageDir": str(args.output_dir)}, ensure_ascii=False, indent=2))
        else:
            result = validate_companion_asset_package(args.package_dir)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (HatchPetBridgeError, FileExistsError, OSError, KeyError, TypeError, ValueError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
