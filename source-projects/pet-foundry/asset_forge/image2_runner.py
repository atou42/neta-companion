from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
import urllib.error
import urllib.parse
import urllib.request

from .faithful_pet import HATCH_PET_DIR, REPO_ROOT


DEFAULT_IMAGE2_MODEL = "gpt-image-2"
DEFAULT_IMAGE2_SIZE = "2k"
DEFAULT_IMAGE2_BASE_URL = "https://new-api.talesofai.com/v1"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
SIZE_PRESETS = {
    "square": "1024x1024",
    "1k-square": "1024x1024",
    "landscape": "1536x1024",
    "horizontal": "1536x1024",
    "1k-landscape": "1536x1024",
    "1k-horizontal": "1536x1024",
    "portrait": "1024x1536",
    "vertical": "1024x1536",
    "1k-portrait": "1024x1536",
    "1k-vertical": "1024x1536",
    "2k": "2048x2048",
    "2k-square": "2048x2048",
    "2k-landscape": "2048x1152",
    "2k-horizontal": "2048x1152",
    "2k-portrait": "1152x2048",
    "2k-vertical": "1152x2048",
    "4k": "3840x2160",
    "4k-landscape": "3840x2160",
    "4k-horizontal": "3840x2160",
    "4k-portrait": "2160x3840",
    "4k-vertical": "2160x3840",
    "4k-square": "4096x4096",
}
SIZE_PATTERN = re.compile(r"^[1-9][0-9]{2,4}x[1-9][0-9]{2,4}$")


class Image2RunnerError(RuntimeError):
    pass


@dataclass(frozen=True)
class Image2RunResult:
    files: tuple[Path, ...]
    metadata: Path
    stdout: dict[str, Any]


def load_json_object(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise Image2RunnerError(f"invalid JSON file: {path}") from exc
    if not isinstance(data, dict):
        raise Image2RunnerError(f"JSON file must contain an object: {path}")
    return data


def is_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def resolve_image2_cli(override: str | None = None) -> Path:
    candidates: list[Path] = []
    if override:
        candidates.append(Path(override).expanduser())
    env_override = os.environ.get("PET_FOUNDRY_IMAGE2_CLI")
    if env_override:
        candidates.append(Path(env_override).expanduser())
    codex_home = Path(os.environ.get("CODEX_HOME") or "~/.codex").expanduser()
    candidates.append(codex_home / "skills/image2/scripts/image2.py")
    candidates.append(Path("~/.codex/skills/image2/scripts/image2.py").expanduser())

    seen: set[Path] = set()
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if resolved.is_file():
            return resolved
    raise Image2RunnerError(
        "image2 CLI not found. Set PET_FOUNDRY_IMAGE2_CLI or install the image2 skill under CODEX_HOME."
    )


def parse_prompt_file(path: Path) -> str:
    if not path.is_file():
        raise Image2RunnerError(f"prompt file not found: {path}")
    prompt = path.read_text(encoding="utf-8").strip()
    if not prompt:
        raise Image2RunnerError(f"prompt file is empty: {path}")
    return prompt


def parse_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        values[key] = value
    return values


def find_dotenv(start: Path) -> Path | None:
    for candidate in [start] + list(start.parents):
        dotenv = candidate / ".env"
        if dotenv.is_file():
            return dotenv
    return None


def pick_config(
    *,
    cli_value: str | None,
    dotenv: dict[str, str],
    names: list[str],
    default: str | None = None,
) -> str | None:
    if cli_value:
        return cli_value
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    for name in names:
        value = dotenv.get(name)
        if value:
            return value
    return default


def resolve_image2_size(value: str) -> str:
    cleaned = value.strip().lower()
    size = SIZE_PRESETS.get(cleaned, cleaned)
    if not SIZE_PATTERN.match(size):
        raise Image2RunnerError(f"invalid image2 size: {value}")
    width, height = (int(part) for part in size.split("x", 1))
    if width < 1024 or height < 1024 or width > 4096 or height > 4096:
        raise Image2RunnerError(f"image2 size is out of supported range: {size}")
    return size


def build_image2_endpoint(base_url: str) -> str:
    clean = base_url.rstrip("/")
    if clean.endswith("/images/generations"):
        return clean
    return f"{clean}/images/generations"


def safe_output_base_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-._")
    return cleaned or "image2"


def request_image2_json(
    *,
    endpoint: str,
    api_key: str,
    payload: dict[str, Any],
    timeout: int,
) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(endpoint, data=body, method="POST")
    request.add_header("Authorization", f"Bearer {api_key}")
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise Image2RunnerError(f"image2 HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise Image2RunnerError(f"image2 request failed: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise Image2RunnerError("image2 response is not JSON") from exc
    if not isinstance(data, dict):
        raise Image2RunnerError("image2 response JSON must be an object")
    return data


def detect_image_extension(image_bytes: bytes) -> str:
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if image_bytes.startswith(b"\xff\xd8"):
        return ".jpg"
    if image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        return ".webp"
    return ".png"


def extension_from_url(url: str) -> str | None:
    suffix = Path(urllib.parse.urlparse(url).path).suffix.lower()
    if suffix in IMAGE_SUFFIXES:
        return ".jpg" if suffix == ".jpeg" else suffix
    return None


def download_image(url: str, timeout: int) -> tuple[bytes, str | None]:
    request = urllib.request.Request(url, method="GET", headers={"User-Agent": "pet-foundry-image2/0.1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            content_type = response.headers.get("Content-Type") or ""
            body = response.read()
    except urllib.error.HTTPError as exc:
        raise Image2RunnerError(f"image2 output download HTTP {exc.code}: {url}") from exc
    except urllib.error.URLError as exc:
        raise Image2RunnerError(f"image2 output download failed: {url} ({exc.reason})") from exc
    guessed = mimetypes.guess_extension(content_type.split(";", 1)[0].strip())
    if guessed == ".jpeg":
        guessed = ".jpg"
    if guessed not in IMAGE_SUFFIXES:
        guessed = None
    return body, guessed


def save_image2_outputs(
    *,
    response: dict[str, Any],
    output_dir: Path,
    base_name: str,
    timeout: int,
) -> list[Path]:
    data = response.get("data")
    if not isinstance(data, list) or not data:
        raise Image2RunnerError("image2 response does not contain image data")
    output_dir.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []
    for index, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            raise Image2RunnerError(f"image2 response item {index} is not an object")
        image_bytes: bytes | None = None
        extension: str | None = None
        b64_json = item.get("b64_json")
        image_url = item.get("url")
        if isinstance(b64_json, str) and b64_json:
            try:
                image_bytes = base64.b64decode(b64_json)
            except ValueError as exc:
                raise Image2RunnerError(f"image2 response item {index} has invalid b64_json") from exc
            extension = detect_image_extension(image_bytes)
        elif isinstance(image_url, str) and image_url:
            image_bytes, extension = download_image(image_url, timeout)
            extension = extension or extension_from_url(image_url) or detect_image_extension(image_bytes)
        else:
            raise Image2RunnerError(f"image2 response item {index} has neither b64_json nor url")
        output_path = output_dir / f"{base_name}_{index:03d}{extension}"
        output_path.write_bytes(image_bytes)
        saved.append(output_path)
    return saved


def write_image2_metadata(
    *,
    output_dir: Path,
    base_name: str,
    endpoint: str,
    payload: dict[str, Any],
    response: dict[str, Any],
    files: list[Path],
) -> Path:
    metadata = {
        "endpoint": endpoint,
        "request": payload,
        "response": response,
        "files": [str(path.resolve()) for path in files],
    }
    path = output_dir / f"{base_name}_response.json"
    path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def load_input_url_map(path: Path | None) -> dict[str, str]:
    if path is None:
        return {}
    data = load_json_object(path)
    mapping: dict[str, str] = {}
    for key, value in data.items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise Image2RunnerError("input URL map must be a JSON object of string path to string URL")
        if not is_http_url(value):
            raise Image2RunnerError(f"input URL map value is not an http(s) URL: {key}")
        mapping[key] = value
    return mapping


def parse_input_url_overrides(values: list[str] | None) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for raw in values or []:
        if "=" not in raw:
            raise Image2RunnerError("--input-url must use PATH=URL")
        key, value = raw.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            raise Image2RunnerError("--input-url path is empty")
        if not is_http_url(value):
            raise Image2RunnerError(f"--input-url value is not an http(s) URL: {key}")
        mapping[key] = value
    return mapping


def merge_input_url_maps(*maps: dict[str, str]) -> dict[str, str]:
    merged: dict[str, str] = {}
    for mapping in maps:
        merged.update(mapping)
    return merged


def load_hatch_pet_manifest(run_dir: Path) -> dict[str, Any]:
    manifest_path = run_dir / "imagegen-jobs.json"
    if not manifest_path.is_file():
        raise Image2RunnerError(f"job manifest not found: {manifest_path}")
    return load_json_object(manifest_path)


def hatch_pet_jobs(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    jobs = manifest.get("jobs")
    if not isinstance(jobs, list):
        raise Image2RunnerError("invalid imagegen-jobs.json: jobs must be a list")
    if not all(isinstance(job, dict) for job in jobs):
        raise Image2RunnerError("invalid imagegen-jobs.json: every job must be an object")
    return jobs


def find_hatch_pet_job(manifest: dict[str, Any], job_id: str) -> dict[str, Any]:
    for job in hatch_pet_jobs(manifest):
        if job.get("id") == job_id:
            return job
    raise Image2RunnerError(f"unknown job id: {job_id}")


def validate_hatch_pet_job_ready(manifest: dict[str, Any], job: dict[str, Any]) -> None:
    completed = {
        str(item["id"])
        for item in hatch_pet_jobs(manifest)
        if item.get("status") == "complete" and isinstance(item.get("id"), str)
    }
    missing = [
        dep
        for dep in job.get("depends_on", [])
        if isinstance(dep, str) and dep not in completed
    ]
    if missing:
        raise Image2RunnerError(
            f"job {job.get('id')} is not ready; missing dependency result(s): {', '.join(missing)}"
        )


def hatch_pet_job_prompt(run_dir: Path, job: dict[str, Any]) -> str:
    raw = job.get("prompt_file")
    if not isinstance(raw, str) or not raw:
        raise Image2RunnerError(f"job {job.get('id')} has no prompt_file")
    return parse_prompt_file(run_dir / raw)


def hatch_pet_job_input_urls(
    *,
    run_dir: Path,
    job: dict[str, Any],
    input_url_map: dict[str, str],
) -> list[str]:
    raw_inputs = job.get("input_images")
    if not isinstance(raw_inputs, list):
        raise Image2RunnerError(f"job {job.get('id')} has invalid input_images")

    urls: list[str] = []
    missing: list[str] = []
    for item in raw_inputs:
        if not isinstance(item, dict):
            raise Image2RunnerError(f"job {job.get('id')} has an invalid input image entry")
        direct_url = item.get("url")
        if isinstance(direct_url, str) and direct_url:
            if not is_http_url(direct_url):
                raise Image2RunnerError(f"job {job.get('id')} input url is not http(s): {direct_url}")
            urls.append(direct_url)
            continue

        raw_path = item.get("path")
        if not isinstance(raw_path, str) or not raw_path:
            raise Image2RunnerError(f"job {job.get('id')} has an input image without path or url")
        local_path = (run_dir / raw_path).resolve()
        if not local_path.is_file():
            raise Image2RunnerError(f"input image for job {job.get('id')} not found: {local_path}")
        url = input_url_map.get(raw_path) or input_url_map.get(str(local_path))
        if not url:
            missing.append(raw_path)
            continue
        urls.append(url)

    if missing:
        raise Image2RunnerError(
            "image2 accepts reference images as http(s) URLs; missing URL mapping for "
            + ", ".join(missing)
        )
    return urls


def run_image2_cli(
    *,
    image2_cli: Path,
    prompt: str,
    output_dir: Path,
    base_name: str,
    images: list[str] | None = None,
    size: str = DEFAULT_IMAGE2_SIZE,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    env_file: Path | None = None,
    timeout: int | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        str(image2_cli),
        "--prompt",
        prompt,
        "--output-dir",
        str(output_dir),
        "--base-name",
        base_name,
        "--size",
        size,
    ]
    if model:
        command.extend(["--model", model])
    if base_url:
        command.extend(["--base-url", base_url])
    if api_key:
        command.extend(["--api-key", api_key])
    if env_file:
        command.extend(["--env-file", str(env_file)])
    if timeout is not None:
        command.extend(["--timeout", str(timeout)])
    for image in images or []:
        command.extend(["--image", image])
    if dry_run:
        command.append("--dry-run")

    completed = subprocess.run(command, text=True, capture_output=True, cwd=str(REPO_ROOT))
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise Image2RunnerError(f"image2 CLI failed: {detail}")
    try:
        data = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise Image2RunnerError("image2 CLI did not print JSON") from exc
    if not isinstance(data, dict):
        raise Image2RunnerError("image2 CLI JSON output must be an object")
    return data


def run_image2_native(
    *,
    prompt: str,
    output_dir: Path,
    base_name: str,
    images: list[str] | None = None,
    size: str = DEFAULT_IMAGE2_SIZE,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    env_file: Path | None = None,
    timeout: int | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    dotenv_path = env_file if env_file else find_dotenv(Path.cwd())
    dotenv = parse_dotenv(dotenv_path) if dotenv_path else {}
    resolved_api_key = pick_config(
        cli_value=api_key,
        dotenv=dotenv,
        names=["TALESOFAI_IMAGE_API_KEY", "TALESOFAI_API_KEY", "NEW_API_KEY"],
    )
    if not resolved_api_key and not dry_run:
        raise Image2RunnerError("missing API key. Set TALESOFAI_IMAGE_API_KEY or pass --api-key.")
    resolved_base_url = pick_config(
        cli_value=base_url,
        dotenv=dotenv,
        names=["TALESOFAI_IMAGE_BASE_URL", "TALESOFAI_BASE_URL", "NEW_API_BASE_URL"],
        default=DEFAULT_IMAGE2_BASE_URL,
    )
    resolved_model = pick_config(
        cli_value=model,
        dotenv=dotenv,
        names=["TALESOFAI_IMAGE_MODEL", "TALESOFAI_MODEL"],
        default=DEFAULT_IMAGE2_MODEL,
    )
    assert resolved_base_url is not None
    assert resolved_model is not None
    resolved_size = resolve_image2_size(size)
    endpoint = build_image2_endpoint(resolved_base_url)
    payload: dict[str, Any] = {
        "model": resolved_model,
        "prompt": prompt,
        "size": resolved_size,
    }
    image_inputs = images or []
    if image_inputs:
        payload["image"] = image_inputs[0] if len(image_inputs) == 1 else image_inputs
    if dry_run:
        return {"endpoint": endpoint, "payload": payload}

    base = safe_output_base_name(base_name or f"image2_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    response = request_image2_json(
        endpoint=endpoint,
        api_key=resolved_api_key or "",
        payload=payload,
        timeout=timeout or 300,
    )
    files = save_image2_outputs(
        response=response,
        output_dir=output_dir,
        base_name=base,
        timeout=timeout or 300,
    )
    metadata = write_image2_metadata(
        output_dir=output_dir,
        base_name=base,
        endpoint=endpoint,
        payload=payload,
        response=response,
        files=files,
    )
    return {
        "files": [str(path.resolve()) for path in files],
        "metadata": str(metadata.resolve()),
    }


def resolve_output_path(raw: str, *, output_dir: Path) -> Path:
    path = Path(raw).expanduser()
    if path.is_absolute():
        return path.resolve()
    repo_relative = (REPO_ROOT / path).resolve()
    if repo_relative.exists():
        return repo_relative
    return (output_dir / path).resolve()


def validate_image2_result(
    *,
    stdout: dict[str, Any],
    output_dir: Path,
    run_dir: Path | None = None,
) -> Image2RunResult:
    raw_files = stdout.get("files")
    raw_metadata = stdout.get("metadata")
    if not isinstance(raw_files, list) or not raw_files:
        raise Image2RunnerError("image2 CLI output is missing files")
    if len(raw_files) != 1:
        raise Image2RunnerError("image2 CLI returned multiple images; select one output explicitly before recording")
    if not isinstance(raw_metadata, str) or not raw_metadata:
        raise Image2RunnerError("image2 CLI output is missing metadata")
    if not all(isinstance(item, str) for item in raw_files):
        raise Image2RunnerError("image2 CLI files must be string paths")

    files = tuple(resolve_output_path(item, output_dir=output_dir) for item in raw_files)
    metadata = resolve_output_path(raw_metadata, output_dir=output_dir)
    for path in files:
        if not path.is_file():
            raise Image2RunnerError(f"image2 output image not found: {path}")
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            raise Image2RunnerError(f"image2 output has unsupported image extension: {path}")
    if not metadata.is_file():
        raise Image2RunnerError(f"image2 metadata not found: {metadata}")
    if run_dir is not None and is_relative_to(metadata, run_dir):
        raise Image2RunnerError("image2 output-dir must be outside the hatch-pet run dir")

    metadata_data = load_json_object(metadata)
    metadata_files = metadata_data.get("files")
    if not isinstance(metadata_files, list) or len(metadata_files) != 1:
        raise Image2RunnerError("image2 metadata must list exactly one generated file")
    if not isinstance(metadata_files[0], str):
        raise Image2RunnerError("image2 metadata file path must be a string")
    metadata_resolved = resolve_output_path(metadata_files[0], output_dir=output_dir)
    if metadata_resolved != files[0]:
        raise Image2RunnerError("image2 metadata files do not match the selected output image")
    return Image2RunResult(files=files, metadata=metadata, stdout=stdout)


def record_hatch_pet_image2_result(
    *,
    run_dir: Path,
    job_id: str,
    source: Path,
    metadata: Path,
    force: bool,
) -> dict[str, Any]:
    command = [
        sys.executable,
        str(HATCH_PET_DIR / "scripts" / "record_imagegen_result.py"),
        "--run-dir",
        str(run_dir),
        "--job-id",
        job_id,
        "--source",
        str(source),
        "--provider",
        "image2",
        "--provider-metadata",
        str(metadata),
    ]
    if force:
        command.append("--force")
    completed = subprocess.run(command, text=True, capture_output=True, cwd=str(REPO_ROOT))
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise Image2RunnerError(f"record_imagegen_result.py failed: {detail}")
    try:
        data = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise Image2RunnerError("record_imagegen_result.py did not print JSON") from exc
    if not isinstance(data, dict):
        raise Image2RunnerError("record_imagegen_result.py JSON output must be an object")
    return data


def build_common_image2_parser(description: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--image2-cli", default="", help="Optional compatibility path to an external image2.py CLI.")
    parser.add_argument("--output-dir", required=True, help="Provider output directory. Keep this outside hatch-pet run dirs.")
    parser.add_argument("--size", default=DEFAULT_IMAGE2_SIZE, help="image2 size alias or WIDTHxHEIGHT.")
    parser.add_argument("--model", default="", help=f"image2 model. Default comes from image2 CLI, normally {DEFAULT_IMAGE2_MODEL}.")
    parser.add_argument("--base-url", default="", help="image2 API base URL.")
    parser.add_argument("--api-key", default="", help="image2 API key. Prefer TALESOFAI_IMAGE_API_KEY.")
    parser.add_argument("--env-file", default="", help="Optional .env file for image2 CLI.")
    parser.add_argument("--timeout", type=int, default=300, help="HTTP timeout in seconds.")
    parser.add_argument("--dry-run", action="store_true", help="Print the image2 request without calling the API.")
    return parser


def print_json(value: object) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))
