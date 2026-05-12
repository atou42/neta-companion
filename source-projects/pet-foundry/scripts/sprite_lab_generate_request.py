#!/usr/bin/env python3
"""Run a non-interactive Pet Foundry generation request.

This is the backend worker used by Sprite Lab when the browser asks the current
Cohub space to generate a sheet. It writes status JSON under tmp/sprite-lab-agent
so the static page can poll progress through /public.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import traceback
from pathlib import Path
from typing import Any

GENERATION_ROWS = (
    "idle",
    "running-right",
    "running-left",
    "waving",
    "jumping",
    "failed",
    "waiting",
    "running",
    "review",
)


def slugify(value: str, fallback: str = "pet") -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug[:64] or fallback


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def run(command: list[str], cwd: Path, message: str, status_path: Path, state: dict[str, Any]) -> subprocess.CompletedProcess[str]:
    state.update(status="running", message=message, updatedAt=time.time())
    write_json(status_path, state)
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    state["lastCommand"] = command
    state["lastStdout"] = result.stdout[-4000:]
    state["lastStderr"] = result.stderr[-4000:]
    state["updatedAt"] = time.time()
    write_json(status_path, state)
    if result.returncode != 0:
        raise RuntimeError(f"{message} 失败：\n{(result.stderr or result.stdout)[-3000:]}")
    return result


def run_image2(command: list[str], cwd: Path, message: str, status_path: Path, state: dict[str, Any], attempts: int = 3) -> subprocess.CompletedProcess[str]:
    last_error = ""
    for attempt in range(1, attempts + 1):
        state.update(status="running", message=f"{message}（第 {attempt}/{attempts} 次，image2 可能需要数分钟）", updatedAt=time.time())
        write_json(status_path, state)
        result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
        state["lastCommand"] = command
        state["lastStdout"] = result.stdout[-4000:]
        state["lastStderr"] = result.stderr[-4000:]
        state["updatedAt"] = time.time()
        write_json(status_path, state)
        if result.returncode == 0:
            return result
        last_error = (result.stderr or result.stdout)[-3000:]
        if "TimeoutError" not in last_error and "timed out" not in last_error.lower():
            break
        time.sleep(8 * attempt)
    raise RuntimeError(f"{message} 失败：\n{last_error}")


def load_manifest(run_dir: Path) -> dict[str, Any]:
    return json.loads((run_dir / "imagegen-jobs.json").read_text(encoding="utf-8"))


def find_manifest_job(manifest: dict[str, Any], job_id: str) -> dict[str, Any]:
    for job in manifest.get("jobs", []):
        if isinstance(job, dict) and job.get("id") == job_id:
            return job
    raise ValueError(f"未知 imagegen job：{job_id}")


def publish_reference_inputs(
    *,
    run_dir: Path,
    job: dict[str, Any],
    public_dir: Path,
    public_url_prefix: str,
    public_group: str,
) -> Path:
    mapping: dict[str, str] = {}
    for item in job.get("input_images") or []:
        if not isinstance(item, dict):
            continue
        raw_path = item.get("path")
        if not isinstance(raw_path, str) or not raw_path:
            continue
        local = (run_dir / raw_path).resolve()
        if not local.is_file():
            continue
        safe_name = "__".join(slugify(part, "asset") for part in Path(raw_path).parts)
        suffix = local.suffix or ".png"
        target_rel = Path("sprite-lab-agent") / public_group / "refs" / f"{safe_name}{suffix}"
        target = public_dir / target_rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local, target)
        url = f"{public_url_prefix.rstrip('/')}/{target_rel.as_posix()}"
        mapping[raw_path] = url
        mapping[str(local)] = url
    map_path = run_dir / "input-url-map.sprite-lab-agent.json"
    write_json(map_path, mapping)
    return map_path


def publish_final_assets(*, run_dir: Path, public_dir: Path, public_url_prefix: str, public_group: str) -> dict[str, str]:
    assets: dict[str, str] = {}
    spritesheet = run_dir / "final/spritesheet.aligned.webp"
    if not spritesheet.exists():
        spritesheet = run_dir / "final/spritesheet.webp"
    candidates = {
        "spritesheet": spritesheet,
        "contactSheet": run_dir / "qa/contact-sheet.png",
        "validation": run_dir / "final/validation.json",
        "review": run_dir / "qa/review.json",
    }
    for key, source in candidates.items():
        if not source.exists():
            continue
        target_rel = Path("sprite-lab-agent") / public_group / "final" / source.name
        target = public_dir / target_rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        assets[key] = f"{public_url_prefix.rstrip('/')}/{target_rel.as_posix()}"
    return assets


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Pet Foundry sheet for Sprite Lab")
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--status", required=True, type=Path)
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    request = json.loads(args.request.read_text(encoding="utf-8"))
    pet_name = str(request.get("petName") or "").strip()
    description = str(request.get("description") or "").strip()
    notes = str(request.get("notes") or "").strip()
    job_id = str(request.get("jobId") or args.status.stem)
    public_url_prefix = os.environ.get("PUBLIC_URL_PREFIX", "").strip()
    public_dir = Path(os.environ.get("PUBLIC_DIR") or "/public").resolve()

    state: dict[str, Any] = {
        "ok": True,
        "jobId": job_id,
        "status": "running",
        "message": "开始生成",
        "petName": pet_name,
        "createdAt": time.time(),
        "updatedAt": time.time(),
    }
    write_json(args.status, state)

    try:
        if not pet_name or not description:
            raise ValueError("请填写角色名称和角色描述")
        if not public_url_prefix:
            raise RuntimeError("需要 PUBLIC_URL_PREFIX，image2 才能读取参考图 URL")

        run_slug = slugify(pet_name, "")
        pet_id = run_slug or f"pet-{job_id[:8]}"
        run_dir = repo_root / "runs" / pet_id
        provider_root = repo_root / "provider-runs" / pet_id / "image2"
        public_group = f"{pet_id}-{job_id[:8]}"
        state["runDir"] = str(run_dir.relative_to(repo_root))
        state["publicGroup"] = public_group
        write_json(args.status, state)

        run(
            [
                sys.executable,
                str(repo_root / "vendor/openai-skills/hatch-pet/scripts/prepare_pet_run.py"),
                "--pet-name",
                pet_name,
                "--pet-id",
                pet_id,
                "--description",
                description,
                "--pet-notes",
                notes or description,
                "--output-dir",
                str(run_dir),
                "--force",
            ],
            repo_root,
            "准备 hatch-pet run",
            args.status,
            state,
        )

        run_image2(
            [
                sys.executable,
                str(repo_root / "scripts/generate_hatch_pet_image2_job.py"),
                "--run-dir",
                str(run_dir),
                "--job-id",
                "base",
                "--output-dir",
                str(provider_root / "base"),
                "--base-name",
                "base",
                "--timeout",
                "900",
                "--force",
            ],
            repo_root,
            "使用 image2 生成 canonical base",
            args.status,
            state,
        )

        for row in GENERATION_ROWS:
            manifest = load_manifest(run_dir)
            manifest_job = find_manifest_job(manifest, row)
            map_path = publish_reference_inputs(
                run_dir=run_dir,
                job=manifest_job,
                public_dir=public_dir,
                public_url_prefix=public_url_prefix,
                public_group=public_group,
            )
            run_image2(
                [
                    sys.executable,
                    str(repo_root / "scripts/generate_hatch_pet_image2_job.py"),
                    "--run-dir",
                    str(run_dir),
                    "--job-id",
                    row,
                    "--output-dir",
                    str(provider_root / row),
                    "--input-url-map",
                    str(map_path),
                    "--base-name",
                    row,
                    "--timeout",
                    "900",
                    "--force",
                ],
                repo_root,
                f"使用 image2 生成 {row} 动作行",
                args.status,
                state,
            )

        finalized = False
        last_finalize_error = None
        for finalize_attempt in range(1, 4):
            try:
                run(
                    [sys.executable, str(repo_root / "vendor/openai-skills/hatch-pet/scripts/finalize_pet_run.py"), "--run-dir", str(run_dir)],
                    repo_root,
                    f"Finalize spritesheet（第 {finalize_attempt} 次）",
                    args.status,
                    state,
                )
                finalized = True
                break
            except RuntimeError as error:
                last_finalize_error = error
                if finalize_attempt >= 3:
                    break
                review_path = run_dir / "qa" / "review.json"
                if not review_path.exists():
                    raise
                run(
                    [
                        sys.executable,
                        str(repo_root / "vendor/openai-skills/hatch-pet/scripts/queue_pet_repairs.py"),
                        "--run-dir",
                        str(run_dir),
                        "--review",
                        str(review_path),
                    ],
                    repo_root,
                    f"QA 未通过，自动排队修复失败动作行（第 {finalize_attempt} 次）",
                    args.status,
                    state,
                )
                manifest = load_manifest(run_dir)
                pending_rows = [
                    str(item.get("id"))
                    for item in manifest.get("jobs", [])
                    if isinstance(item, dict) and item.get("id") in GENERATION_ROWS and item.get("status") == "pending"
                ]
                if not pending_rows:
                    raise RuntimeError("QA 未通过，但没有找到可自动修复的 pending 动作行")
                for row in pending_rows:
                    manifest = load_manifest(run_dir)
                    manifest_job = find_manifest_job(manifest, row)
                    map_path = publish_reference_inputs(
                        run_dir=run_dir,
                        job=manifest_job,
                        public_dir=public_dir,
                        public_url_prefix=public_url_prefix,
                        public_group=public_group,
                    )
                    run_image2(
                        [
                            sys.executable,
                            str(repo_root / "scripts/generate_hatch_pet_image2_job.py"),
                            "--run-dir",
                            str(run_dir),
                            "--job-id",
                            row,
                            "--output-dir",
                            str(provider_root / row),
                            "--input-url-map",
                            str(map_path),
                            "--base-name",
                            row,
                            "--timeout",
                            "900",
                            "--force",
                        ],
                        repo_root,
                        f"自动修复并重新生成 {row} 动作行",
                        args.status,
                        state,
                    )
        if not finalized:
            state["lastFinalizeError"] = str(last_finalize_error) if last_finalize_error else ""
            write_json(args.status, state)
            run(
                [
                    sys.executable,
                    str(repo_root / "vendor/openai-skills/hatch-pet/scripts/finalize_pet_run.py"),
                    "--run-dir",
                    str(run_dir),
                    "--allow-slot-extraction",
                ],
                repo_root,
                "多次自动修复后仍未通过组件切帧 QA，降级为允许 slot 切帧 finalize",
                args.status,
                state,
            )

        run(
            [
                sys.executable,
                str(repo_root / "scripts/auto_align_spritesheet.py"),
                "--spritesheet",
                str(run_dir / "final/spritesheet.webp"),
                "--output",
                str(run_dir / "final/spritesheet.aligned.webp"),
                "--alignment-out",
                str(run_dir / "qa/auto-alignment.json"),
                "--metadata-out",
                str(run_dir / "qa/auto-alignment-metadata.json"),
                "--max-shift",
                "28",
            ],
            repo_root,
            "自动对齐各动作帧，减少抖动",
            args.status,
            state,
        )

        run(
            [
                sys.executable,
                str(repo_root / "scripts/qa_spritesheet_alignment.py"),
                str(run_dir / "final/spritesheet.aligned.webp"),
                "--anchor-drift",
                "28",
                "--json-out",
                str(run_dir / "qa/alignment-qa.json"),
            ],
            repo_root,
            "E2E 对齐验收",
            args.status,
            state,
        )

        assets = publish_final_assets(run_dir=run_dir, public_dir=public_dir, public_url_prefix=public_url_prefix, public_group=public_group)
        state.update(status="done", message="生成完成", assets=assets, sheetUrl=assets.get("spritesheet"), updatedAt=time.time())
        write_json(args.status, state)
        return 0
    except Exception as error:
        state.update(status="failed", message="生成失败", error=str(error), traceback=traceback.format_exc(), updatedAt=time.time())
        write_json(args.status, state)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
