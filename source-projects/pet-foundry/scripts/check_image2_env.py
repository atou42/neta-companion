#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


DEFAULT_RELATIVE_IMAGE2_CLI = "skills/image2/scripts/image2.py"


def mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "***"
    return value[:4] + "..." + value[-4:]


def check_path(path: Path) -> dict[str, Any]:
    return {
        "path": str(path),
        "exists": path.exists(),
        "isFile": path.is_file(),
        "executable": os.access(path, os.X_OK) if path.exists() else False,
    }


def candidate_image2_paths(codex_home: Path, explicit: str | None) -> list[Path]:
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit).expanduser())
    candidates.append(codex_home / DEFAULT_RELATIVE_IMAGE2_CLI)
    candidates.append(Path("~/.codex").expanduser() / DEFAULT_RELATIVE_IMAGE2_CLI)

    unique: list[Path] = []
    seen: set[Path] = set()
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(resolved)
    return unique


def run_list_sizes(cli: Path, timeout: int) -> dict[str, Any]:
    command = [sys.executable, str(cli), "--list-sizes"]
    try:
        completed = subprocess.run(
            command,
            text=True,
            capture_output=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "command": command,
            "error": f"timed out after {timeout}s",
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
        }
    return {
        "ok": completed.returncode == 0,
        "command": command,
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }


def build_report(*, probe: bool, timeout: int) -> dict[str, Any]:
    raw_codex_home = os.environ.get("CODEX_HOME") or "~/.codex"
    codex_home = Path(raw_codex_home).expanduser().resolve()
    raw_cli = os.environ.get("PET_FOUNDRY_IMAGE2_CLI") or ""
    raw_key = os.environ.get("TALESOFAI_IMAGE_API_KEY") or ""

    candidates = candidate_image2_paths(codex_home, raw_cli or None)
    selected = next((path for path in candidates if path.is_file()), None)

    issues: list[str] = []
    warnings: list[str] = []
    if not os.environ.get("CODEX_HOME"):
        warnings.append("CODEX_HOME is not set; defaulting to ~/.codex")
    if not raw_key:
        issues.append("TALESOFAI_IMAGE_API_KEY is not set")
    if selected is None:
        issues.append(
            "image2 CLI not found; install codex-skills-shared/bootstrap links or set PET_FOUNDRY_IMAGE2_CLI"
        )
    if raw_cli and selected is not None and Path(raw_cli).expanduser().resolve() != selected:
        warnings.append("PET_FOUNDRY_IMAGE2_CLI is set but did not resolve to the selected CLI")

    probe_result: dict[str, Any] | None = None
    if probe:
        if selected is None:
            probe_result = {"ok": False, "error": "cannot probe because image2 CLI is missing"}
        else:
            probe_result = run_list_sizes(selected, timeout)
            if not probe_result.get("ok"):
                issues.append("image2 --list-sizes probe failed")

    return {
        "ok": not issues,
        "environment": {
            "CODEX_HOME": str(codex_home),
            "CODEX_HOME_set": bool(os.environ.get("CODEX_HOME")),
            "PET_FOUNDRY_IMAGE2_CLI": raw_cli,
            "TALESOFAI_IMAGE_API_KEY_set": bool(raw_key),
            "TALESOFAI_IMAGE_API_KEY_preview": mask_secret(raw_key),
        },
        "image2Cli": {
            "selected": str(selected) if selected else None,
            "candidates": [check_path(path) for path in candidates],
        },
        "probe": probe_result,
        "issues": issues,
        "warnings": warnings,
        "setupHint": [
            "git clone https://github.com/atou42/codex-skills-shared.git ~/codex-skills-shared",
            "cd ~/codex-skills-shared && ./scripts/bootstrap_links.sh",
            "export CODEX_HOME=\"$HOME/.codex\"",
            "export PET_FOUNDRY_IMAGE2_CLI=\"$HOME/.codex/skills/image2/scripts/image2.py\"",
            "export TALESOFAI_IMAGE_API_KEY=\"...\"",
            "python \"$PET_FOUNDRY_IMAGE2_CLI\" --list-sizes",
        ],
    }


def print_text(report: dict[str, Any]) -> None:
    env = report["environment"]
    cli = report["image2Cli"]
    print("Image2 environment check")
    print(f"  CODEX_HOME: {env['CODEX_HOME']}" + ("" if env["CODEX_HOME_set"] else " (default)"))
    print(f"  PET_FOUNDRY_IMAGE2_CLI: {env['PET_FOUNDRY_IMAGE2_CLI'] or '(not set)'}")
    print(f"  TALESOFAI_IMAGE_API_KEY: {'set ' + env['TALESOFAI_IMAGE_API_KEY_preview'] if env['TALESOFAI_IMAGE_API_KEY_set'] else 'missing'}")
    print(f"  selected image2 CLI: {cli['selected'] or '(not found)'}")
    print("  candidates:")
    for candidate in cli["candidates"]:
        state = "OK" if candidate["isFile"] else "missing"
        print(f"    - {candidate['path']} [{state}]")
    if report.get("probe") is not None:
        probe = report["probe"]
        print(f"  --list-sizes probe: {'OK' if probe.get('ok') else 'FAIL'}")
        if probe.get("stdout"):
            print("  probe stdout:")
            print(str(probe["stdout"]).rstrip())
        if probe.get("stderr"):
            print("  probe stderr:")
            print(str(probe["stderr"]).rstrip())
    for warning in report["warnings"]:
        print(f"warning: {warning}")
    for issue in report["issues"]:
        print(f"error: {issue}")
    if report["issues"]:
        print("\nSetup hint:")
        for line in report["setupHint"]:
            print(f"  {line}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Pet Foundry image2 runtime prerequisites.")
    parser.add_argument("--probe", action="store_true", help="Run image2.py --list-sizes after path checks.")
    parser.add_argument("--timeout", type=int, default=30, help="Probe timeout in seconds.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args()

    report = build_report(probe=args.probe, timeout=args.timeout)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_text(report)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
