from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
import json
import hashlib
import shutil
import os
from pathlib import Path

from PIL import Image

from asset_forge.faithful_pet import (
    ATLAS,
    HATCH_PET_DIR,
    REPO_ROOT,
    ROWS,
    assert_upstream_vendor_complete,
    rows_from_upstream_reference,
)
from asset_forge.companion_bridge import (
    HatchPetBridgeError,
    build_asset_package_from_hatch_pet_run,
    validate_hatch_pet_asset_package,
)
from scripts.run_faithful_pet_acceptance import prepare_synthetic_run, run_acceptance


GENERATE_HATCH_PET_IMAGE2_JOB = REPO_ROOT / "scripts" / "generate_hatch_pet_image2_job.py"
RUN_IMAGE2 = REPO_ROOT / "scripts" / "run_image2.py"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def write_image2_metadata(path: Path, *, source: Path, prompt: str = "image2 prompt") -> None:
    write_json(
        path,
        {
            "endpoint": "https://new-api.talesofai.com/v1/images/generations",
            "request": {
                "model": "gpt-image-2",
                "prompt": prompt,
                "size": "2048x2048",
            },
            "response": {"id": "test-response"},
            "files": [str(source.resolve())],
        },
    )


def write_fake_image2_cli(path: Path) -> None:
    path.write_text(
        """#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from PIL import Image


parser = argparse.ArgumentParser()
parser.add_argument("--prompt", required=True)
parser.add_argument("--image", action="append", default=[])
parser.add_argument("--size", default="2k")
parser.add_argument("--model", default="gpt-image-2")
parser.add_argument("--base-url", default="https://new-api.talesofai.com/v1")
parser.add_argument("--api-key", default="")
parser.add_argument("--env-file", default="")
parser.add_argument("--output-dir", required=True)
parser.add_argument("--base-name", required=True)
parser.add_argument("--timeout", default="300")
parser.add_argument("--dry-run", action="store_true")
args = parser.parse_args()

endpoint = args.base_url.rstrip("/") + "/images/generations"
payload = {
    "model": args.model,
    "prompt": args.prompt,
    "size": "2048x2048" if args.size == "2k" else args.size,
}
if args.image:
    payload["image"] = args.image[0] if len(args.image) == 1 else args.image
if args.dry_run:
    print(json.dumps({"endpoint": endpoint, "payload": payload}, ensure_ascii=False))
    raise SystemExit(0)

mode = os.environ.get("FAKE_IMAGE2_MODE", "ok")
output_dir = Path(args.output_dir)
output_dir.mkdir(parents=True, exist_ok=True)
files = []
count = 2 if mode == "two-images" else 1
for index in range(1, count + 1):
    image_path = output_dir / f"{args.base_name}_{index:03d}.png"
    Image.new("RGBA", (1024, 1024), (index, 12, 34, 255)).save(image_path)
    files.append(str(image_path.resolve()))
metadata = output_dir / f"{args.base_name}_response.json"
if mode != "missing-metadata":
    metadata.write_text(
        json.dumps(
            {
                "endpoint": endpoint,
                "request": payload,
                "response": {"id": "fake"},
                "files": files,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\\n",
        encoding="utf-8",
    )
print(json.dumps({"files": files, "metadata": str(metadata.resolve())}, ensure_ascii=False))
""",
        encoding="utf-8",
    )


def convert_synthetic_run_to_image2_provenance(run_dir: Path, provider_dir: Path) -> None:
    manifest_path = run_dir / "imagegen-jobs.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for job in manifest["jobs"]:
        job_id = job["id"]
        output = run_dir / job["output_path"]
        source = provider_dir / f"{job_id}.png"
        shutil.copy2(output, source)
        metadata = provider_dir / f"{job_id}_response.json"
        prompt = f"image2 prompt for {job_id}"
        write_image2_metadata(metadata, source=source, prompt=prompt)
        job["source_path"] = str(source)
        job["source_provenance"] = "image2"
        job["source_sha256"] = file_sha256(source)
        job["output_sha256"] = file_sha256(output)
        job["status"] = "complete"
        job.pop("synthetic_test_source", None)
        job["source_provider"] = {
            "name": "image2",
            "metadata_path": str(metadata.resolve()),
            "metadata_sha256": file_sha256(metadata),
            "endpoint": "https://new-api.talesofai.com/v1/images/generations",
            "model": "gpt-image-2",
            "size": "2048x2048",
            "prompt_sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


class FaithfulPetPipelineTest(unittest.TestCase):
    def test_vendor_contract_is_present(self) -> None:
        assert_upstream_vendor_complete()
        self.assertEqual(ATLAS["width"], 1536)
        self.assertEqual(ATLAS["height"], 1872)
        self.assertEqual(len(ROWS), 9)

    def test_local_row_contract_matches_upstream_reference(self) -> None:
        self.assertEqual(ROWS, rows_from_upstream_reference())

    def test_upstream_finalize_acceptance_outputs_original_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp) / "synthetic-run"
            run_acceptance(run_dir)
            with Image.open(run_dir / "final" / "spritesheet.png") as sheet:
                self.assertEqual(sheet.size, (1536, 1872))
            self.assertTrue((run_dir / "final" / "spritesheet.webp").is_file())
            self.assertTrue((run_dir / "final" / "validation.json").is_file())
            self.assertTrue((run_dir / "qa" / "review.json").is_file())
            self.assertTrue((run_dir / "qa" / "contact-sheet.png").is_file())

    def test_synthetic_sources_are_rejected_without_test_flag(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp) / "synthetic-run"
            prepare_synthetic_run(run_dir)
            completed = subprocess.run(
                [
                    sys.executable,
                    str(HATCH_PET_DIR / "scripts" / "finalize_pet_run.py"),
                    "--run-dir",
                    str(run_dir),
                    "--skip-videos",
                    "--skip-package",
                ],
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("uses a synthetic test source", completed.stderr + completed.stdout)

    def test_record_rejects_run_dir_visual_sources(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp) / "synthetic-run"
            prepare_synthetic_run(run_dir)
            completed = subprocess.run(
                [
                    sys.executable,
                    str(HATCH_PET_DIR / "scripts" / "record_imagegen_result.py"),
                    "--run-dir",
                    str(run_dir),
                    "--job-id",
                    "base",
                    "--source",
                    str(run_dir / "decoded" / "base.png"),
                    "--force",
                ],
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("source image is inside the pet run directory", completed.stderr + completed.stdout)

    def test_record_accepts_image2_source_with_provider_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "synthetic-run"
            provider_dir = root / "image2-output"
            prepare_synthetic_run(run_dir)
            source = provider_dir / "base_001.png"
            source.parent.mkdir(parents=True)
            shutil.copy2(run_dir / "decoded" / "base.png", source)
            metadata = provider_dir / "base_response.json"
            write_image2_metadata(metadata, source=source)

            completed = subprocess.run(
                [
                    sys.executable,
                    str(HATCH_PET_DIR / "scripts" / "record_imagegen_result.py"),
                    "--run-dir",
                    str(run_dir),
                    "--job-id",
                    "base",
                    "--source",
                    str(source),
                    "--provider",
                    "image2",
                    "--provider-metadata",
                    str(metadata),
                    "--force",
                ],
                text=True,
                capture_output=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)
            manifest = json.loads((run_dir / "imagegen-jobs.json").read_text(encoding="utf-8"))
            base = next(job for job in manifest["jobs"] if job["id"] == "base")
            self.assertEqual(base["source_provenance"], "image2")
            self.assertEqual(base["source_provider"]["name"], "image2")
            self.assertTrue((run_dir / "references" / "canonical-base.png").is_file())

    def test_run_image2_cli_wrapper_validates_fake_provider_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fake_cli = root / "fake_image2.py"
            output_dir = root / "image2-output"
            write_fake_image2_cli(fake_cli)

            completed = subprocess.run(
                [
                    sys.executable,
                    str(RUN_IMAGE2),
                    "--prompt",
                    "A small companion sprite.",
                    "--output-dir",
                    str(output_dir),
                    "--image2-cli",
                    str(fake_cli),
                    "--base-name",
                    "generic",
                ],
                text=True,
                capture_output=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)
            payload = json.loads(completed.stdout)
            self.assertTrue(payload["ok"])
            self.assertEqual(len(payload["files"]), 1)
            self.assertTrue(Path(payload["metadata"]).is_file())

    def test_run_image2_native_dry_run_does_not_need_cli_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            completed = subprocess.run(
                [
                    sys.executable,
                    str(RUN_IMAGE2),
                    "--prompt",
                    "A small companion sprite.",
                    "--output-dir",
                    str(root / "image2-output"),
                    "--dry-run",
                ],
                text=True,
                capture_output=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)
            payload = json.loads(completed.stdout)
            self.assertEqual(payload["payload"]["model"], "gpt-image-2")
            self.assertEqual(payload["payload"]["size"], "2048x2048")

    def test_run_image2_cli_wrapper_rejects_local_reference_image_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fake_cli = root / "fake_image2.py"
            write_fake_image2_cli(fake_cli)

            completed = subprocess.run(
                [
                    sys.executable,
                    str(RUN_IMAGE2),
                    "--prompt",
                    "A small companion sprite.",
                    "--image",
                    str(root / "local.png"),
                    "--output-dir",
                    str(root / "image2-output"),
                    "--image2-cli",
                    str(fake_cli),
                    "--dry-run",
                ],
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("http(s) URLs", completed.stderr + completed.stdout)

    def test_generate_hatch_pet_image2_job_records_base(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "pet-run"
            provider_dir = root / "image2-output"
            fake_cli = root / "fake_image2.py"
            write_fake_image2_cli(fake_cli)
            subprocess.run(
                [
                    sys.executable,
                    str(HATCH_PET_DIR / "scripts" / "prepare_pet_run.py"),
                    "--pet-name",
                    "Starry",
                    "--description",
                    "A compact star pet.",
                    "--output-dir",
                    str(run_dir),
                    "--force",
                ],
                text=True,
                capture_output=True,
                check=True,
            )

            completed = subprocess.run(
                [
                    sys.executable,
                    str(GENERATE_HATCH_PET_IMAGE2_JOB),
                    "--run-dir",
                    str(run_dir),
                    "--job-id",
                    "base",
                    "--output-dir",
                    str(provider_dir),
                    "--image2-cli",
                    str(fake_cli),
                    "--force",
                ],
                text=True,
                capture_output=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)
            manifest = json.loads((run_dir / "imagegen-jobs.json").read_text(encoding="utf-8"))
            base = next(job for job in manifest["jobs"] if job["id"] == "base")
            self.assertEqual(base["status"], "complete")
            self.assertEqual(base["source_provenance"], "image2")
            self.assertEqual(base["source_provider"]["name"], "image2")
            self.assertTrue((run_dir / "decoded" / "base.png").is_file())
            self.assertTrue((run_dir / "references" / "canonical-base.png").is_file())

    def test_generate_hatch_pet_image2_job_records_grounded_row_with_url_map(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "pet-run"
            provider_dir = root / "image2-output"
            fake_cli = root / "fake_image2.py"
            write_fake_image2_cli(fake_cli)
            subprocess.run(
                [
                    sys.executable,
                    str(HATCH_PET_DIR / "scripts" / "prepare_pet_run.py"),
                    "--pet-name",
                    "Starry",
                    "--description",
                    "A compact star pet.",
                    "--output-dir",
                    str(run_dir),
                    "--force",
                ],
                text=True,
                capture_output=True,
                check=True,
            )
            subprocess.run(
                [
                    sys.executable,
                    str(GENERATE_HATCH_PET_IMAGE2_JOB),
                    "--run-dir",
                    str(run_dir),
                    "--job-id",
                    "base",
                    "--output-dir",
                    str(provider_dir / "base"),
                    "--image2-cli",
                    str(fake_cli),
                    "--force",
                ],
                text=True,
                capture_output=True,
                check=True,
            )

            url_map = {
                "references/layout-guides/idle.png": "https://assets.example.test/idle-guide.png",
                "references/canonical-base.png": "https://assets.example.test/canonical-base.png",
                "decoded/base.png": "https://assets.example.test/base.png",
            }
            write_json(root / "input-url-map.json", url_map)
            completed = subprocess.run(
                [
                    sys.executable,
                    str(GENERATE_HATCH_PET_IMAGE2_JOB),
                    "--run-dir",
                    str(run_dir),
                    "--job-id",
                    "idle",
                    "--output-dir",
                    str(provider_dir / "idle"),
                    "--image2-cli",
                    str(fake_cli),
                    "--input-url-map",
                    str(root / "input-url-map.json"),
                    "--force",
                ],
                text=True,
                capture_output=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)
            manifest = json.loads((run_dir / "imagegen-jobs.json").read_text(encoding="utf-8"))
            idle = next(job for job in manifest["jobs"] if job["id"] == "idle")
            self.assertEqual(idle["status"], "complete")
            self.assertEqual(idle["source_provider"]["input_images"], list(url_map.values()))

    def test_generate_hatch_pet_image2_job_rejects_grounded_row_without_url_map(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "pet-run"
            provider_dir = root / "image2-output"
            fake_cli = root / "fake_image2.py"
            write_fake_image2_cli(fake_cli)
            subprocess.run(
                [
                    sys.executable,
                    str(HATCH_PET_DIR / "scripts" / "prepare_pet_run.py"),
                    "--pet-name",
                    "Starry",
                    "--description",
                    "A compact star pet.",
                    "--output-dir",
                    str(run_dir),
                    "--force",
                ],
                text=True,
                capture_output=True,
                check=True,
            )
            subprocess.run(
                [
                    sys.executable,
                    str(GENERATE_HATCH_PET_IMAGE2_JOB),
                    "--run-dir",
                    str(run_dir),
                    "--job-id",
                    "base",
                    "--output-dir",
                    str(provider_dir / "base"),
                    "--image2-cli",
                    str(fake_cli),
                    "--force",
                ],
                text=True,
                capture_output=True,
                check=True,
            )

            completed = subprocess.run(
                [
                    sys.executable,
                    str(GENERATE_HATCH_PET_IMAGE2_JOB),
                    "--run-dir",
                    str(run_dir),
                    "--job-id",
                    "idle",
                    "--output-dir",
                    str(provider_dir / "idle"),
                    "--image2-cli",
                    str(fake_cli),
                    "--dry-run",
                ],
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("missing URL mapping", completed.stderr + completed.stdout)

    def test_generate_hatch_pet_image2_job_rejects_missing_provider_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "pet-run"
            provider_dir = root / "image2-output"
            fake_cli = root / "fake_image2.py"
            write_fake_image2_cli(fake_cli)
            subprocess.run(
                [
                    sys.executable,
                    str(HATCH_PET_DIR / "scripts" / "prepare_pet_run.py"),
                    "--pet-name",
                    "Starry",
                    "--description",
                    "A compact star pet.",
                    "--output-dir",
                    str(run_dir),
                    "--force",
                ],
                text=True,
                capture_output=True,
                check=True,
            )

            completed = subprocess.run(
                [
                    sys.executable,
                    str(GENERATE_HATCH_PET_IMAGE2_JOB),
                    "--run-dir",
                    str(run_dir),
                    "--job-id",
                    "base",
                    "--output-dir",
                    str(provider_dir),
                    "--image2-cli",
                    str(fake_cli),
                ],
                text=True,
                capture_output=True,
                env={**os.environ, "FAKE_IMAGE2_MODE": "missing-metadata"},
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("metadata not found", completed.stderr + completed.stdout)

    def test_record_rejects_image2_source_not_listed_in_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "synthetic-run"
            provider_dir = root / "image2-output"
            prepare_synthetic_run(run_dir)
            source = provider_dir / "base_001.png"
            other = provider_dir / "other_001.png"
            source.parent.mkdir(parents=True)
            shutil.copy2(run_dir / "decoded" / "base.png", source)
            shutil.copy2(run_dir / "decoded" / "base.png", other)
            metadata = provider_dir / "base_response.json"
            write_image2_metadata(metadata, source=other)

            completed = subprocess.run(
                [
                    sys.executable,
                    str(HATCH_PET_DIR / "scripts" / "record_imagegen_result.py"),
                    "--run-dir",
                    str(run_dir),
                    "--job-id",
                    "base",
                    "--source",
                    str(source),
                    "--provider",
                    "image2",
                    "--provider-metadata",
                    str(metadata),
                    "--force",
                ],
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("not listed in the image2 response metadata files", completed.stderr + completed.stdout)

    def test_finalize_accepts_image2_provider_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "synthetic-run"
            provider_dir = root / "image2-output"
            prepare_synthetic_run(run_dir)
            provider_dir.mkdir(parents=True)
            convert_synthetic_run_to_image2_provenance(run_dir, provider_dir)

            completed = subprocess.run(
                [
                    sys.executable,
                    str(HATCH_PET_DIR / "scripts" / "finalize_pet_run.py"),
                    "--run-dir",
                    str(run_dir),
                    "--skip-videos",
                    "--skip-package",
                ],
                text=True,
                capture_output=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)

    def test_finalize_rejects_tampered_image2_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "synthetic-run"
            provider_dir = root / "image2-output"
            prepare_synthetic_run(run_dir)
            provider_dir.mkdir(parents=True)
            convert_synthetic_run_to_image2_provenance(run_dir, provider_dir)
            metadata = provider_dir / "idle_response.json"
            data = json.loads(metadata.read_text(encoding="utf-8"))
            data["request"]["prompt"] = "tampered prompt"
            write_json(metadata, data)

            completed = subprocess.run(
                [
                    sys.executable,
                    str(HATCH_PET_DIR / "scripts" / "finalize_pet_run.py"),
                    "--run-dir",
                    str(run_dir),
                    "--skip-videos",
                    "--skip-package",
                ],
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("image2 metadata hash does not match", completed.stderr + completed.stdout)

    def test_bridge_packages_finalized_hatch_pet_run_as_asset_forge_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "synthetic-run"
            package_dir = root / "companion-package"
            run_acceptance(run_dir)

            manifest = build_asset_package_from_hatch_pet_run(
                run_dir,
                package_dir,
                allow_synthetic_sources=True,
            )
            self.assertEqual(manifest["assetKind"], "companion")
            self.assertEqual(manifest["sourceProfile"], "codex-pet")
            self.assertEqual(manifest["generation"]["strategy"], "hatch-pet-base-first-grounded-row-strips")
            contract = json.loads((package_dir / "contract.json").read_text(encoding="utf-8"))
            self.assertEqual(contract["schemaVersion"], "pet-foundry.companion.contract.v0")
            self.assertEqual(contract["assetKind"], "companion")
            companion_manifest = json.loads((package_dir / "exports/companion/companion.json").read_text(encoding="utf-8"))
            self.assertEqual(companion_manifest["schemaVersion"], "pet-foundry.companion.v0")
            export_eligibility = json.loads((package_dir / "qa/export-eligibility.json").read_text(encoding="utf-8"))
            self.assertIn("companion", export_eligibility["allowedExports"])
            result = validate_hatch_pet_asset_package(package_dir)
            self.assertTrue(result["ok"])
            self.assertTrue((package_dir / "exports/companion/companion.json").is_file())
            self.assertTrue((package_dir / "exports/companion/spritesheet.webp").is_file())
            self.assertTrue((package_dir / "exports/codex-pet/pet.json").is_file())
            self.assertTrue((package_dir / "exports/codex-pet/spritesheet.webp").is_file())

    def test_bridge_rejects_synthetic_pet_run_by_default(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "synthetic-run"
            run_acceptance(run_dir)
            with self.assertRaises(HatchPetBridgeError):
                build_asset_package_from_hatch_pet_run(run_dir, root / "package")

    def test_bridge_rejects_nontransparent_unused_pet_cells(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "synthetic-run"
            run_acceptance(run_dir)
            with Image.open(run_dir / "final/spritesheet.webp") as opened:
                tampered = opened.convert("RGBA")
            tampered.putpixel(
                (7 * ATLAS["cell_width"] + 4, 0 * ATLAS["cell_height"] + 4),
                (255, 0, 0, 255),
            )
            tampered.save(run_dir / "final/spritesheet.webp", format="WEBP", lossless=True)
            with self.assertRaises(HatchPetBridgeError):
                build_asset_package_from_hatch_pet_run(
                    run_dir,
                    root / "package",
                    allow_synthetic_sources=True,
                )

    def test_bridge_rejects_missing_agent_neutral_companion_export(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "synthetic-run"
            package_dir = root / "companion-package"
            run_acceptance(run_dir)
            build_asset_package_from_hatch_pet_run(
                run_dir,
                package_dir,
                allow_synthetic_sources=True,
            )
            (package_dir / "exports/companion/companion.json").unlink()
            with self.assertRaises(HatchPetBridgeError):
                validate_hatch_pet_asset_package(package_dir)


if __name__ == "__main__":
    unittest.main()
