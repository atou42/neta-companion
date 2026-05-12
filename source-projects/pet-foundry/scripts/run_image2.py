#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from asset_forge.image2_runner import (  # noqa: E402
    Image2RunnerError,
    build_common_image2_parser,
    parse_prompt_file,
    print_json,
    resolve_image2_cli,
    run_image2_cli,
    run_image2_native,
    is_http_url,
    validate_image2_result,
)


def main() -> int:
    parser = build_common_image2_parser("Run the bundled image2 CLI with Pet Foundry validation.")
    prompt_group = parser.add_mutually_exclusive_group(required=True)
    prompt_group.add_argument("--prompt", help="Prompt text.")
    prompt_group.add_argument("--prompt-file", help="Prompt file.")
    parser.add_argument("--image", action="append", default=[], help="Reference image http(s) URL. Repeat for multiple images.")
    parser.add_argument("--base-name", default="image2", help="Output file base name.")
    args = parser.parse_args()

    try:
        prompt = args.prompt.strip() if args.prompt else parse_prompt_file(Path(args.prompt_file).expanduser())
        if not prompt:
            raise Image2RunnerError("prompt is empty")
        bad_images = [image for image in args.image if not is_http_url(image)]
        if bad_images:
            raise Image2RunnerError("image2 reference images must be http(s) URLs: " + ", ".join(bad_images))
        output_dir = Path(args.output_dir).expanduser().resolve()
        run_kwargs = {
            "prompt": prompt,
            "output_dir": output_dir,
            "base_name": args.base_name,
            "images": args.image,
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
            print_json(stdout)
            return 0
        result = validate_image2_result(stdout=stdout, output_dir=output_dir)
        print_json(
            {
                "ok": True,
                "files": [str(path) for path in result.files],
                "metadata": str(result.metadata),
            }
        )
        return 0
    except Image2RunnerError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
