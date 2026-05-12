#!/usr/bin/env python3
"""Prepare a Sprite Lab review URL for a generated Pet Foundry spritesheet.

This helper does not generate art by itself. It locates a finalized spritesheet
from a run directory, optionally copies it to a local static review directory,
and prints a URL that opens sprite-lab with the sheet preloaded.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import shutil
import subprocess
import sys
import time
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote


DEFAULT_SHEET_CANDIDATES = (
    "final/spritesheet.aligned.webp",
    "final/spritesheet.webp",
    "neutral/images/spritesheet.webp",
    "exports/companion/spritesheet.webp",
    "exports/codex-pet/spritesheet.webp",
)


def resolve_sheet(args: argparse.Namespace) -> Path:
    if args.spritesheet:
        return args.spritesheet.expanduser().resolve()
    if not args.run_dir:
        raise SystemExit("provide --run-dir or --spritesheet")
    run_dir = args.run_dir.expanduser().resolve()
    for relative in DEFAULT_SHEET_CANDIDATES:
        candidate = run_dir / relative
        if candidate.exists():
            return candidate
    raise SystemExit(f"no spritesheet found under {run_dir}; checked {', '.join(DEFAULT_SHEET_CANDIDATES)}")


def copy_for_review(source: Path, review_dir: Path, name: str | None = None) -> Path:
    review_dir.mkdir(parents=True, exist_ok=True)
    target = review_dir / (name or source.name)
    if target.resolve() != source.resolve():
        shutil.copy2(source, target)
    return target


def build_url(host: str, port: int, sheet_rel: str, alignment_rel: str | None = None, name: str | None = None) -> str:
    params = [f"sheet=/{quote(sheet_rel)}"]
    if alignment_rel:
        params.append(f"alignment=/{quote(alignment_rel)}")
    if name:
        params.append(f"name={quote(name)}")
    return f"http://{host}:{port}/sprite-lab/index.html?" + "&".join(params)


def open_browser(url: str) -> None:
    try:
        webbrowser.open(url)
    except Exception:
        pass


def serve(root: Path, host: str, port: int) -> None:
    mimetypes.add_type("image/webp", ".webp")
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    httpd = ThreadingHTTPServer((host, port), handler)
    actual_port = httpd.server_address[1]
    print(json.dumps({"serving": True, "root": str(root), "host": host, "port": actual_port}, indent=2))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


def run_generate_command(command: str) -> None:
    print(json.dumps({"running": command}, indent=2))
    result = subprocess.run(command, shell=True)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> int:
    parser = argparse.ArgumentParser(description="Open Sprite Lab with a generated/finalized spritesheet preloaded")
    parser.add_argument("--run-dir", type=Path, help="Pet Foundry run dir; defaults to final/spritesheet.webp inside it")
    parser.add_argument("--spritesheet", type=Path, help="Explicit spritesheet image to load")
    parser.add_argument("--alignment", type=Path, help="Optional Sprite Lab alignment JSON to preload")
    parser.add_argument("--generate-command", help="Optional shell command to run before locating the spritesheet")
    parser.add_argument("--review-dir", type=Path, default=Path("tmp/sprite-lab-review"), help="Static review copy directory")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--serve", action="store_true", help="Start a local HTTP server after printing the URL")
    parser.add_argument("--open", action="store_true", help="Open the URL in the default browser")
    args = parser.parse_args()

    if args.generate_command:
        run_generate_command(args.generate_command)

    repo_root = Path(__file__).resolve().parents[1]
    sheet = resolve_sheet(args)
    review_root = args.review_dir.expanduser().resolve()
    copied_sheet = copy_for_review(sheet, review_root / "sheets")

    copied_alignment = None
    if args.alignment:
        copied_alignment = copy_for_review(args.alignment.expanduser().resolve(), review_root / "alignments")

    # Keep a copy of sprite-lab in the review tree so one static server can serve both app and assets.
    sprite_lab_src = repo_root / "web" / "sprite-lab"
    sprite_lab_dst = review_root / "sprite-lab"
    if sprite_lab_dst.exists():
        shutil.rmtree(sprite_lab_dst)
    shutil.copytree(sprite_lab_src, sprite_lab_dst, ignore=shutil.ignore_patterns("README.md"))

    sheet_rel = copied_sheet.relative_to(review_root).as_posix()
    alignment_rel = copied_alignment.relative_to(review_root).as_posix() if copied_alignment else None
    url = build_url(args.host, args.port, sheet_rel, alignment_rel, sheet.name)
    result = {
        "url": url,
        "spritesheet": str(sheet),
        "reviewCopy": str(copied_sheet),
        "alignment": str(args.alignment) if args.alignment else None,
        "serve": f"python {Path(__file__).as_posix()} --spritesheet {sheet} --review-dir {review_root} --serve",
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))

    if args.open:
        open_browser(url)

    if args.serve:
        # Give stdout consumers a tiny moment to read the URL before request logs start.
        time.sleep(0.1)
        serve(review_root, args.host, args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
