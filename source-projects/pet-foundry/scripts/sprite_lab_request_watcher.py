#!/usr/bin/env python3
"""Watch /public Sprite Lab requests and dispatch them into the current Cohub chat.

This is the closest safe integration available without a platform-provided
public backend route: the public page writes a request JSON; this watcher sends
a message into the current Cohub session asking the agent to run the generation
worker for that request.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Dispatch Sprite Lab public requests to current Cohub agent/session")
    parser.add_argument("--requests-dir", type=Path, default=Path("/public/sprite-lab-agent/requests"))
    parser.add_argument("--space", default=os.environ.get("COHUB_SPACE_ID", ""))
    parser.add_argument("--session", default=os.environ.get("COHUB_SESSION_ID", ""))
    parser.add_argument("--interval", type=float, default=3.0)
    args = parser.parse_args()
    if not args.space or not args.session:
        raise SystemExit("COHUB_SPACE_ID/COHUB_SESSION_ID are required")
    args.requests_dir.mkdir(parents=True, exist_ok=True)

    print(json.dumps({"ok": True, "watching": str(args.requests_dir), "space": args.space, "session": args.session}, indent=2))
    while True:
        for request_path in sorted(args.requests_dir.glob("*/request.json")):
            job_dir = request_path.parent
            dispatched = job_dir / "dispatched.flag"
            if dispatched.exists():
                continue
            request = json.loads(request_path.read_text(encoding="utf-8"))
            status_path = job_dir / "status.json"
            message = f"""
网页 Sprite Lab 收到一个生成请求，请在当前 /workspace 中执行真实 image2/Pet Foundry 生成，并更新状态 JSON。

请求文件：{request_path}
状态文件：{status_path}

请运行：
. .venv/bin/activate
[ -f \"$HOME/.pet-foundry-image2-env\" ] && . \"$HOME/.pet-foundry-image2-env\"
python scripts/check_image2_env.py --probe
python scripts/sprite_lab_generate_request.py --request {request_path} --status {status_path}

注意：真实视觉资产必须使用 image2；不要用本地合成图片冒充生产产物。完成后状态文件会给出 sheetUrl，网页会自动加载。
""".strip()
            result = subprocess.run(
                ["cohub", "-s", args.space, "spaces", "sessions", "messages", "send", args.session],
                input=message,
                text=True,
                capture_output=True,
            )
            if result.returncode == 0:
                dispatched.write_text(str(time.time()), encoding="utf-8")
                status = json.loads(status_path.read_text(encoding="utf-8")) if status_path.exists() else request
                status.update(status="dispatched", message="请求已发送到 Cohub agent，等待 agent 执行生成。", updatedAt=time.time())
                status_path.write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                print(json.dumps({"dispatched": request.get("jobId"), "request": str(request_path)}, ensure_ascii=False))
            else:
                print(json.dumps({"error": result.stderr[-1000:], "request": str(request_path)}, ensure_ascii=False))
        time.sleep(args.interval)


if __name__ == "__main__":
    raise SystemExit(main())
