#!/usr/bin/env python3
"""Local Agent Bridge for Sprite Lab.

This server lets the browser UI ask the local Pet Foundry runtime to generate,
finalize, and load spritesheets. It is intended for localhost review. The
published/shareable Sprite Lab page can talk to this bridge through CORS, but
image generation still happens in the local/runtime environment where secrets
and image2 are configured.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

DEFAULT_SHEET_CANDIDATES = (
    "final/spritesheet.aligned.webp",
    "final/spritesheet.webp",
    "neutral/images/spritesheet.webp",
    "exports/companion/spritesheet.webp",
    "exports/codex-pet/spritesheet.webp",
)

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


def json_response(handler: SimpleHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, X-Sprite-Lab-Token")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.end_headers()
    handler.wfile.write(body)


def slugify(value: str, fallback: str = "pet") -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug[:64] or fallback


def safe_relative_path(repo_root: Path, value: str, label: str) -> Path:
    if not value:
        raise ValueError(f"{label} 不能为空")
    raw = Path(value).expanduser()
    path = raw if raw.is_absolute() else repo_root / raw
    resolved = path.resolve()
    if repo_root not in (resolved, *resolved.parents):
        raise ValueError(f"{label} must stay inside repository root")
    return resolved


def resolve_sheet(run_dir: Path) -> Path:
    for relative in DEFAULT_SHEET_CANDIDATES:
        candidate = run_dir / relative
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"在 {run_dir} 下没有找到 spritesheet")


def copy_asset(source: Path, assets_dir: Path) -> Path:
    assets_dir.mkdir(parents=True, exist_ok=True)
    target = assets_dir / source.name
    if target.resolve() != source.resolve():
        shutil.copy2(source, target)
    return target


def load_manifest(run_dir: Path) -> dict[str, Any]:
    return json.loads((run_dir / "imagegen-jobs.json").read_text(encoding="utf-8"))


def find_manifest_job(manifest: dict[str, Any], job_id: str) -> dict[str, Any]:
    for job in manifest.get("jobs", []):
        if isinstance(job, dict) and job.get("id") == job_id:
            return job
    raise ValueError(f"未知 imagegen job：{job_id}")


def run_subprocess(command: list[str], cwd: Path, message: str, update) -> subprocess.CompletedProcess[str]:
    update(message)
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if result.returncode != 0:
        tail = (result.stderr or result.stdout)[-3000:]
        raise RuntimeError(f"{message} 失败：\n{tail}")
    return result


def run_image2_subprocess(command: list[str], cwd: Path, message: str, update, attempts: int = 3) -> subprocess.CompletedProcess[str]:
    last_error = ""
    for attempt in range(1, attempts + 1):
        update(f"{message}（第 {attempt}/{attempts} 次，image2 可能需要数分钟）")
        result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
        if result.returncode == 0:
            return result
        last_error = (result.stderr or result.stdout)[-3000:]
        if "TimeoutError" not in last_error and "timed out" not in last_error.lower():
            break
        time.sleep(8 * attempt)
    raise RuntimeError(f"{message} 失败：\n{last_error}")


def publish_reference_inputs(
    *,
    repo_root: Path,
    run_dir: Path,
    job: dict[str, Any],
    public_dir: Path,
    public_url_prefix: str,
    public_group: str,
) -> Path:
    mapping: dict[str, str] = {}
    inputs = job.get("input_images") or []
    for item in inputs:
        if not isinstance(item, dict):
            continue
        raw_path = item.get("path")
        if not isinstance(raw_path, str) or not raw_path:
            continue
        local = (run_dir / raw_path).resolve()
        if not local.is_file():
            continue
        safe_parts = [slugify(part, "asset") for part in Path(raw_path).parts]
        target_rel = Path("sprite-lab-agent") / public_group / "refs" / Path(*safe_parts)
        if local.suffix and not target_rel.name.endswith(local.suffix):
            target_rel = target_rel.with_suffix(local.suffix)
        target = public_dir / target_rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local, target)
        url = f"{public_url_prefix.rstrip('/')}/{target_rel.as_posix()}"
        mapping[raw_path] = url
        mapping[str(local)] = url

    map_path = run_dir / "input-url-map.sprite-lab-agent.json"
    map_path.write_text(json.dumps(mapping, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return map_path


def make_handler(
    *,
    repo_root: Path,
    review_root: Path,
    public_dir: Path,
    public_url_prefix: str | None,
    api_token: str | None,
    host: str,
    port: int,
):
    jobs: dict[str, dict[str, Any]] = {}
    jobs_lock = threading.Lock()

    def set_job(job_id: str, **updates: Any) -> None:
        with jobs_lock:
            jobs.setdefault(job_id, {}).update(updates)
            jobs[job_id]["updatedAt"] = time.time()

    def load_run_payload(run_dir: Path, finalize_log: dict[str, Any] | None = None) -> dict[str, Any]:
        sheet = resolve_sheet(run_dir)
        copied = copy_asset(sheet, review_root / "assets")
        sheet_url = f"/assets/{quote(copied.name)}"
        alignment_url = None
        for candidate in [run_dir / "qa/sprite-lab-alignment.json", run_dir / "final/sprite-lab-alignment.json"]:
            if candidate.exists():
                copied_alignment = copy_asset(candidate, review_root / "assets")
                alignment_url = f"/assets/{quote(copied_alignment.name)}"
                break
        return {
            "ok": True,
            "runDir": str(run_dir.relative_to(repo_root)) if repo_root in (run_dir, *run_dir.parents) else str(run_dir),
            "sheetPath": str(sheet),
            "sheetUrl": sheet_url,
            "alignmentUrl": alignment_url,
            "name": sheet.name,
            "finalize": finalize_log,
        }

    def generation_worker(job_id: str, request: dict[str, Any]) -> None:
        def update(message: str, **extra: Any) -> None:
            set_job(job_id, status="running", message=message, **extra)

        try:
            pet_name = str(request.get("petName") or "").strip()
            description = str(request.get("description") or "").strip()
            notes = str(request.get("notes") or "").strip()
            if not pet_name or not description:
                raise ValueError("请填写角色名称和角色描述")
            if not public_url_prefix:
                raise RuntimeError("需要 PUBLIC_URL_PREFIX，image2 才能通过 http(s) URL 读取行生成参考图")

            run_slug = slugify(pet_name, "")
            pet_id = run_slug or f"pet-{job_id[:8]}"
            run_dir = repo_root / "runs" / pet_id
            provider_root = repo_root / "provider-runs" / pet_id / "image2"
            public_group = f"{pet_id}-{job_id[:8]}"
            set_job(job_id, runDir=str(run_dir.relative_to(repo_root)))

            run_subprocess(
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
                update,
            )

            run_image2_subprocess(
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
                update,
            )

            for row in GENERATION_ROWS:
                manifest = load_manifest(run_dir)
                manifest_job = find_manifest_job(manifest, row)
                map_path = publish_reference_inputs(
                    repo_root=repo_root,
                    run_dir=run_dir,
                    job=manifest_job,
                    public_dir=public_dir,
                    public_url_prefix=public_url_prefix,
                    public_group=public_group,
                )
                run_image2_subprocess(
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
                    update,
                )

            finalized = False
            last_finalize_error = None
            for finalize_attempt in range(1, 4):
                try:
                    run_subprocess(
                        [sys.executable, str(repo_root / "vendor/openai-skills/hatch-pet/scripts/finalize_pet_run.py"), "--run-dir", str(run_dir)],
                        repo_root,
                        f"Finalize spritesheet（第 {finalize_attempt} 次）",
                        update,
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
                    run_subprocess(
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
                        update,
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
                            repo_root=repo_root,
                            run_dir=run_dir,
                            job=manifest_job,
                            public_dir=public_dir,
                            public_url_prefix=public_url_prefix,
                            public_group=public_group,
                        )
                        run_image2_subprocess(
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
                            update,
                        )
            if not finalized:
                update("多次自动修复后仍未通过组件切帧 QA，降级为允许 slot 切帧 finalize")
                run_subprocess(
                    [
                        sys.executable,
                        str(repo_root / "vendor/openai-skills/hatch-pet/scripts/finalize_pet_run.py"),
                        "--run-dir",
                        str(run_dir),
                        "--allow-slot-extraction",
                    ],
                    repo_root,
                    "Finalize spritesheet（允许 slot 切帧）",
                    update,
                )

            for alignment_attempt in range(1, 3):
                try:
                    run_subprocess(
                        [
                            sys.executable,
                            str(repo_root / "scripts/qa_spritesheet_alignment.py"),
                            str(run_dir / "final/spritesheet.webp"),
                            "--anchor-drift",
                            "28",
                            "--json-out",
                            str(run_dir / "qa/alignment-qa.raw.json"),
                        ],
                        repo_root,
                        f"生成后原始动作对齐验收（第 {alignment_attempt} 次）",
                        update,
                    )
                    break
                except RuntimeError:
                    if alignment_attempt >= 2:
                        break
                    run_subprocess(
                        [
                            sys.executable,
                            str(repo_root / "scripts/queue_alignment_repairs.py"),
                            "--run-dir",
                            str(run_dir),
                            "--alignment-qa",
                            str(run_dir / "qa/alignment-qa.raw.json"),
                        ],
                        repo_root,
                        "对齐验收失败，自动排队重做抖动动作行",
                        update,
                    )
                    manifest = load_manifest(run_dir)
                    pending_rows = [
                        str(item.get("id"))
                        for item in manifest.get("jobs", [])
                        if isinstance(item, dict) and item.get("id") in GENERATION_ROWS and item.get("status") == "pending"
                    ]
                    for row in pending_rows:
                        manifest = load_manifest(run_dir)
                        manifest_job = find_manifest_job(manifest, row)
                        map_path = publish_reference_inputs(
                            repo_root=repo_root,
                            run_dir=run_dir,
                            job=manifest_job,
                            public_dir=public_dir,
                            public_url_prefix=public_url_prefix,
                            public_group=public_group,
                        )
                        run_image2_subprocess(
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
                            f"对齐修复并重新生成 {row} 动作行",
                            update,
                        )
                    run_subprocess(
                        [sys.executable, str(repo_root / "vendor/openai-skills/hatch-pet/scripts/finalize_pet_run.py"), "--run-dir", str(run_dir), "--allow-slot-extraction"],
                        repo_root,
                        "对齐修复后重新 finalize",
                        update,
                    )

            for visual_attempt in range(1, 3):
                try:
                    run_subprocess(
                        [
                            sys.executable,
                            str(repo_root / "scripts/qa_visual_consistency.py"),
                            str(run_dir / "final/spritesheet.webp"),
                            "--json-out",
                            str(run_dir / "qa/visual-qa.json"),
                        ],
                        repo_root,
                        f"视觉一致性 QA（第 {visual_attempt} 次）",
                        update,
                    )
                    break
                except RuntimeError:
                    if visual_attempt >= 2:
                        break
                    run_subprocess(
                        [
                            sys.executable,
                            str(repo_root / "scripts/queue_alignment_repairs.py"),
                            "--run-dir",
                            str(run_dir),
                            "--alignment-qa",
                            str(run_dir / "qa/visual-qa.json"),
                        ],
                        repo_root,
                        "视觉 QA 失败，自动排队重做身份/尺寸/循环异常动作行",
                        update,
                    )
                    manifest = load_manifest(run_dir)
                    pending_rows = [
                        str(item.get("id"))
                        for item in manifest.get("jobs", [])
                        if isinstance(item, dict) and item.get("id") in GENERATION_ROWS and item.get("status") == "pending"
                    ]
                    for row in pending_rows:
                        manifest = load_manifest(run_dir)
                        manifest_job = find_manifest_job(manifest, row)
                        map_path = publish_reference_inputs(
                            repo_root=repo_root,
                            run_dir=run_dir,
                            job=manifest_job,
                            public_dir=public_dir,
                            public_url_prefix=public_url_prefix,
                            public_group=public_group,
                        )
                        run_image2_subprocess(
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
                            f"视觉 QA 修复并重新生成 {row} 动作行",
                            update,
                        )
                    run_subprocess(
                        [sys.executable, str(repo_root / "vendor/openai-skills/hatch-pet/scripts/finalize_pet_run.py"), "--run-dir", str(run_dir), "--allow-slot-extraction"],
                        repo_root,
                        "视觉修复后重新 finalize",
                        update,
                    )

            run_subprocess(
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
                update,
            )
            run_subprocess(
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
                update,
            )
            payload = load_run_payload(run_dir)
            set_job(job_id, status="done", message="生成完成", **payload)
        except Exception as error:
            set_job(job_id, status="failed", message="生成失败", error=str(error))

    class SpriteLabAgentHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(review_root), **kwargs)

        def end_headers(self) -> None:
            if not self.path.startswith("/api/"):
                self.send_header("Access-Control-Allow-Origin", "*")
            super().end_headers()

        def do_OPTIONS(self) -> None:  # noqa: N802
            json_response(self, 200, {"ok": True})

        def read_json(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0") or "0")
            if length <= 0:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8"))

        def require_token(self) -> bool:
            if not api_token:
                return True
            provided = self.headers.get("X-Sprite-Lab-Token") or ""
            if provided == api_token:
                return True
            json_response(self, 403, {"ok": False, "error": "API token 不正确"})
            return False

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path == "/api/status":
                return json_response(
                    self,
                    200,
                    {
                        "ok": True,
                        "message": "Agent 生成桥已连接。可以生成新的 Sheet，或加载已有 run。",
                        "repoRoot": str(repo_root),
                        "publicPublishing": bool(public_url_prefix),
                    },
                )
            if parsed.path.startswith("/api/jobs/"):
                if not self.require_token():
                    return
                job_id = parsed.path.rsplit("/", 1)[-1]
                with jobs_lock:
                    payload = dict(jobs.get(job_id) or {})
                if not payload:
                    return json_response(self, 404, {"ok": False, "error": "未知生成任务"})
                payload.setdefault("ok", True)
                payload.setdefault("jobId", job_id)
                return json_response(self, 200, payload)
            return super().do_GET()

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            try:
                if parsed.path == "/api/load-run":
                    if not self.require_token():
                        return
                    data = self.read_json()
                    payload = self.handle_load_run(data, finalize=False)
                    return json_response(self, 200, payload)
                if parsed.path == "/api/finalize-and-load":
                    if not self.require_token():
                        return
                    data = self.read_json()
                    payload = self.handle_load_run(data, finalize=True)
                    return json_response(self, 200, payload)
                if parsed.path == "/api/generate-pet":
                    if not self.require_token():
                        return
                    data = self.read_json()
                    job_id = uuid.uuid4().hex
                    set_job(job_id, status="queued", message="生成任务已排队")
                    thread = threading.Thread(target=generation_worker, args=(job_id, data), daemon=True)
                    thread.start()
                    return json_response(self, 202, {"ok": True, "jobId": job_id, "status": "queued"})
                return json_response(self, 404, {"ok": False, "error": "未知 API endpoint"})
            except Exception as error:
                return json_response(self, 400, {"ok": False, "error": str(error)})

        def handle_load_run(self, data: dict[str, Any], finalize: bool) -> dict[str, Any]:
            run_dir = safe_relative_path(repo_root, str(data.get("runDir") or ""), "runDir")
            if not run_dir.exists():
                raise FileNotFoundError(f"运行目录不存在：{run_dir}")

            finalize_log = None
            if finalize:
                result = subprocess.run(
                    [sys.executable, str(repo_root / "vendor/openai-skills/hatch-pet/scripts/finalize_pet_run.py"), "--run-dir", str(run_dir)],
                    cwd=repo_root,
                    text=True,
                    capture_output=True,
                )
                finalize_log = {"returncode": result.returncode, "stdout": result.stdout[-4000:], "stderr": result.stderr[-4000:]}
                if result.returncode != 0:
                    raise RuntimeError("finalize 失败：" + (result.stderr or result.stdout)[-1200:])
            return load_run_payload(run_dir, finalize_log)

    return SpriteLabAgentHandler


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the local Sprite Lab Agent Bridge")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8790)
    parser.add_argument("--review-root", type=Path, default=Path("tmp/sprite-lab-agent"))
    parser.add_argument("--public-dir", type=Path, default=Path("/public"))
    parser.add_argument("--public-url-prefix", default=os.environ.get("PUBLIC_URL_PREFIX", ""))
    parser.add_argument("--api-token", default=os.environ.get("SPRITE_LAB_API_TOKEN", ""), help="Optional shared token required for mutating API calls")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    review_root = args.review_root.expanduser().resolve()
    review_root.mkdir(parents=True, exist_ok=True)

    sprite_lab_dst = review_root / "sprite-lab"
    if sprite_lab_dst.exists():
        shutil.rmtree(sprite_lab_dst)
    shutil.copytree(repo_root / "web" / "sprite-lab", sprite_lab_dst, ignore=shutil.ignore_patterns("README.md"))

    mimetypes.add_type("image/webp", ".webp")
    handler = make_handler(
        repo_root=repo_root,
        review_root=review_root,
        public_dir=args.public_dir.expanduser().resolve(),
        public_url_prefix=args.public_url_prefix or None,
        api_token=args.api_token or None,
        host=args.host,
        port=args.port,
    )
    httpd = ThreadingHTTPServer((args.host, args.port), handler)
    actual_port = httpd.server_address[1]
    local_url = f"http://{args.host}:{actual_port}/sprite-lab/index.html?api="
    print(
        json.dumps(
            {
                "ok": True,
                "url": local_url,
                "shareableUrlApiParam": f"http://{args.host}:{actual_port}",
                "repoRoot": str(repo_root),
                "reviewRoot": str(review_root),
                "publicUrlPrefix": args.public_url_prefix or None,
                "apiTokenEnabled": bool(args.api_token),
            },
            indent=2,
        )
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
