#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from asset_forge.image2_runner import (  # noqa: E402
    Image2RunnerError,
    build_common_image2_parser,
    find_hatch_pet_job,
    hatch_pet_job_input_urls,
    hatch_pet_job_prompt,
    load_hatch_pet_manifest,
    load_input_url_map,
    merge_input_url_maps,
    parse_input_url_overrides,
    print_json,
    record_hatch_pet_image2_result,
    resolve_image2_cli,
    run_image2_cli,
    run_image2_native,
    is_relative_to,
    validate_hatch_pet_job_ready,
    validate_image2_result,
)


def main() -> int:
    parser = build_common_image2_parser("Generate and optionally record one hatch-pet job through image2.")
    parser.add_argument("--run-dir", required=True, help="hatch-pet run directory.")
    parser.add_argument("--job-id", required=True, help="Job id from imagegen-jobs.json.")
    parser.add_argument("--input-url-map", default="", help="JSON object mapping local input image paths to http(s) URLs.")
    parser.add_argument("--input-url", action="append", default=[], help="Input image URL override as PATH=URL. Repeat as needed.")
    parser.add_argument("--base-name", default="", help="Output file base name. Defaults to the job id.")
    parser.add_argument("--no-record", action="store_true", help="Generate only; do not call record_imagegen_result.py.")
    parser.add_argument("--force", action="store_true", help="Pass --force when recording.")
    args = parser.parse_args()

    try:
        run_dir = Path(args.run_dir).expanduser().resolve()
        output_dir = Path(args.output_dir).expanduser().resolve()
        if not args.dry_run and not args.no_record and is_relative_to(output_dir, run_dir):
            raise Image2RunnerError("image2 output-dir must be outside the hatch-pet run dir")
        manifest = load_hatch_pet_manifest(run_dir)
        job = find_hatch_pet_job(manifest, args.job_id)
        validate_hatch_pet_job_ready(manifest, job)
        prompt = hatch_pet_job_prompt(run_dir, job)
        input_url_map = merge_input_url_maps(
            load_input_url_map(Path(args.input_url_map).expanduser().resolve() if args.input_url_map else None),
            parse_input_url_overrides(args.input_url),
        )
        images = hatch_pet_job_input_urls(run_dir=run_dir, job=job, input_url_map=input_url_map)
        base_name = args.base_name or args.job_id
        run_kwargs = {
            "prompt": prompt,
            "output_dir": output_dir,
            "base_name": base_name,
            "images": images,
            "size": args.size,
            "model": args.model or None,
            "base_url": args.base_url or None,
            "api_key": args.api_key or None,
            "env_file": Path(args.env_file).expanduser().resolve() if args.env_file else None,
            "timeout": args.timeout,
            "dry_run": args.dry_run,
        }
        if args.image2_cli:
            stdout = run_image2_cli(
                image2_cli=resolve_image2_cli(args.image2_cli),
                **run_kwargs,
            )
        else:
            stdout = run_image2_native(**run_kwargs)
        if args.dry_run:
            print_json(
                {
                    "ok": True,
                    "job_id": args.job_id,
                    "image2": stdout,
                }
            )
            return 0

        result = validate_image2_result(stdout=stdout, output_dir=output_dir, run_dir=run_dir)
        payload: dict[str, object] = {
            "ok": True,
            "job_id": args.job_id,
            "source": str(result.files[0]),
            "metadata": str(result.metadata),
        }
        if args.no_record:
            print_json(payload)
            return 0

        payload["record"] = record_hatch_pet_image2_result(
            run_dir=run_dir,
            job_id=args.job_id,
            source=result.files[0],
            metadata=result.metadata,
            force=args.force,
        )
        print_json(payload)
        return 0
    except Image2RunnerError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
