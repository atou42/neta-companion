#!/usr/bin/env python3
"""Queue hatch-pet row repairs from alignment QA output.

Input is produced by scripts/qa_spritesheet_alignment.py. This script reopens
row imagegen jobs whose final spritesheet row has visible geometry drift,
archives the previous decoded row, and appends a repair prompt note.
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def job_list(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    jobs = manifest.get("jobs")
    if not isinstance(jobs, list):
        raise SystemExit("invalid imagegen-jobs.json: jobs must be a list")
    return [job for job in jobs if isinstance(job, dict)]


def next_archive_path(archive_dir: Path, state: str, attempt: int, suffix: str) -> Path:
    candidate = archive_dir / f"{state}-alignment-attempt-{attempt}-previous{suffix}"
    if not candidate.exists():
        return candidate
    counter = 2
    while True:
        candidate = archive_dir / f"{state}-alignment-attempt-{attempt}-previous-{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def archive_decoded_output(run_dir: Path, job: dict[str, Any], state: str, attempt: int) -> str | None:
    output_raw = job.get("output_path")
    output = run_dir / output_raw if isinstance(output_raw, str) and output_raw else run_dir / "decoded" / f"{state}.png"
    if not output.exists():
        return None
    archive_dir = run_dir / "decoded" / "repair-archive"
    archive_dir.mkdir(parents=True, exist_ok=True)
    archived = next_archive_path(archive_dir, state, attempt, output.suffix or ".png")
    shutil.move(str(output), archived)
    return str(archived.relative_to(run_dir))


def append_repair_note(run_dir: Path, state: str, attempt: int, reason: str) -> None:
    prompt_path = run_dir / "prompts" / "rows" / f"{state}.md"
    if not prompt_path.exists():
        raise SystemExit(f"row prompt not found: {prompt_path}")
    existing = prompt_path.read_text(encoding="utf-8")
    note = f"""

Alignment repair attempt {attempt}:
- The previous `{state}` strip failed deterministic motion/alignment QA: {reason}
- Regenerate the entire row as a stable in-place sprite strip.
- Keep the body size, head size, feet/base anchor, and visual center consistent across frames.
- For non-jump actions, keep the feet/base line nearly fixed and avoid vertical bob larger than the action requires.
- For idle/waiting/review, use subtle pose/expression changes only; do not shift the whole character around the cell.
- For running rows, show limb motion while keeping the character centered in each slot with a stable readable baseline.
- Fill every requested frame slot with exactly one complete full-body pet pose, centered in the same 192x208 cell coordinate system.
- Do not redesign the pet; preserve the canonical base identity, proportions, palette, outline, markings, and accessories.
"""
    prompt_path.write_text(existing.rstrip() + note.rstrip() + "\n", encoding="utf-8")


def queue_repair(manifest: dict[str, Any], run_dir: Path, state: str, reason: str) -> dict[str, Any]:
    for job in job_list(manifest):
        if job.get("id") != state:
            continue
        attempt = int(job.get("alignment_repair_attempt", 0)) + 1
        archived_output = archive_decoded_output(run_dir, job, state, attempt)
        job["status"] = "pending"
        job["alignment_repair_attempt"] = attempt
        job["repair_reason"] = reason
        job["queued_at"] = datetime.now(timezone.utc).isoformat()
        if archived_output:
            previous_outputs = job.setdefault("previous_outputs", [])
            if not isinstance(previous_outputs, list):
                previous_outputs = []
                job["previous_outputs"] = previous_outputs
            previous_outputs.append({"attempt": attempt, "path": archived_output, "archived_at": job["queued_at"], "kind": "alignment"})
        for key in [
            "source_path",
            "source_provenance",
            "source_sha256",
            "output_sha256",
            "completed_at",
            "metadata",
            "source_provider",
            "synthetic_test_source",
            "secondary_fallback",
            "derived_from",
            "mirror_decision",
        ]:
            job.pop(key, None)
        append_repair_note(run_dir, state, attempt, reason)
        result: dict[str, Any] = {"state": state, "attempt": attempt, "reason": reason}
        if archived_output:
            result["archived_output"] = archived_output
        return result
    raise SystemExit(f"unknown row job id: {state}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--alignment-qa", required=True, type=Path)
    args = parser.parse_args()

    run_dir = args.run_dir.expanduser().resolve()
    qa = load_json(args.alignment_qa.expanduser().resolve())
    manifest_path = run_dir / "imagegen-jobs.json"
    manifest = load_json(manifest_path)

    queued: list[dict[str, Any]] = []
    for row in qa.get("rows", []):
        if not isinstance(row, dict) or row.get("ok", True):
            continue
        state = str(row.get("state") or "")
        errors = row.get("errors") if isinstance(row.get("errors"), list) else []
        hints = row.get("repairHints") if isinstance(row.get("repairHints"), list) else []
        if not state or not errors:
            continue
        reason = "; ".join(str(error) for error in errors)
        if hints:
            reason += " | Repair hints: " + " ".join(str(hint) for hint in hints)
        queued.append(queue_repair(manifest, run_dir, state, reason))

    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "queued": queued}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
