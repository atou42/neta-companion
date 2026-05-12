#!/usr/bin/env python3
"""Tiny public request API for the static Sprite Lab page.

This is a static-public compatible bridge: the browser writes request JSON into
/public via this API, then a Cohub/agent runtime can run
scripts/sprite_lab_generate_request.py for that request. The API itself does not
hold image secrets and does not generate art.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.end_headers()
    handler.wfile.write(body)


def slugify(value: str, fallback: str = "pet") -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug[:64] or fallback


def make_handler(public_dir: Path, public_url_prefix: str):
    requests_dir = public_dir / "sprite-lab-agent" / "requests"
    requests_dir.mkdir(parents=True, exist_ok=True)

    class Handler(BaseHTTPRequestHandler):
        def do_OPTIONS(self) -> None:  # noqa: N802
            json_response(self, 200, {"ok": True})

        def read_json(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0") or "0")
            if length <= 0:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8"))

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path == "/api/status":
                return json_response(self, 200, {"ok": True, "message": "公开请求桥已连接", "mode": "public-request"})
            if parsed.path.startswith("/api/jobs/"):
                job_id = parsed.path.rsplit("/", 1)[-1]
                status_path = requests_dir / job_id / "status.json"
                if not status_path.exists():
                    return json_response(self, 404, {"ok": False, "error": "未知任务；可能还没有被 agent 接收"})
                payload = json.loads(status_path.read_text(encoding="utf-8"))
                return json_response(self, 200, payload)
            return json_response(self, 404, {"ok": False, "error": "未知 API"})

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path != "/api/generate-pet":
                return json_response(self, 404, {"ok": False, "error": "未知 API"})
            try:
                data = self.read_json()
                pet_name = str(data.get("petName") or "").strip()
                description = str(data.get("description") or "").strip()
                notes = str(data.get("notes") or "").strip()
                if not pet_name or not description:
                    return json_response(self, 400, {"ok": False, "error": "请填写角色名称和角色描述"})
                job_id = uuid.uuid4().hex
                job_dir = requests_dir / job_id
                job_dir.mkdir(parents=True, exist_ok=True)
                request = {
                    "ok": True,
                    "jobId": job_id,
                    "petName": pet_name,
                    "description": description,
                    "notes": notes,
                    "createdAt": time.time(),
                    "status": "submitted",
                    "message": "请求已提交，等待 Cohub agent 接收并生成。",
                }
                (job_dir / "request.json").write_text(json.dumps(request, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                (job_dir / "status.json").write_text(json.dumps(request, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                request_url = f"{public_url_prefix.rstrip()}/sprite-lab-agent/requests/{job_id}/request.json"
                status_url = f"{public_url_prefix.rstrip()}/sprite-lab-agent/requests/{job_id}/status.json"
                return json_response(
                    self,
                    202,
                    {
                        "ok": True,
                        "jobId": job_id,
                        "status": "submitted",
                        "message": "请求已提交。请让 Cohub agent 执行该请求，页面会继续轮询状态。",
                        "requestUrl": request_url,
                        "statusUrl": status_url,
                        "agentCommand": f"python scripts/sprite_lab_generate_request.py --request /public/sprite-lab-agent/requests/{job_id}/request.json --status /public/sprite-lab-agent/requests/{job_id}/status.json",
                    },
                )
            except Exception as error:
                return json_response(self, 400, {"ok": False, "error": str(error)})

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Sprite Lab public request API")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=3000)
    parser.add_argument("--public-dir", type=Path, default=Path("/public"))
    parser.add_argument("--public-url-prefix", default=os.environ.get("PUBLIC_URL_PREFIX", ""))
    args = parser.parse_args()
    handler = make_handler(args.public_dir.expanduser().resolve(), args.public_url_prefix)
    httpd = ThreadingHTTPServer((args.host, args.port), handler)
    print(json.dumps({"ok": True, "url": f"http://{args.host}:{httpd.server_address[1]}", "publicUrlPrefix": args.public_url_prefix}, indent=2))
    httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
