#!/usr/bin/env python3
import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONTRACT = ROOT / "public/foundry/sprite-production.json"
DEFAULT_ROOM_BACKGROUND = ROOT / "public/cuimao/bg.png"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def rel(root, path):
    path = Path(path)
    return path if path.is_absolute() else root / path


def parse_hex(value):
    value = value.strip()
    return tuple(int(value[index:index + 2], 16) for index in (1, 3, 5))


def distance(pixel, key):
    return math.sqrt((pixel[0] - key[0]) ** 2 + (pixel[1] - key[1]) ** 2 + (pixel[2] - key[2]) ** 2)


def remove_chroma(image, key, threshold):
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a and distance((r, g, b), key) <= threshold:
                pixels[x, y] = (r, g, b, 0)
    return image


def alpha_bbox(image):
    alpha = image.getchannel("A")
    return alpha.getbbox()


def fit_to_cell(frame, cell_width, cell_height):
    bbox = alpha_bbox(frame)
    output = Image.new("RGBA", (cell_width, cell_height), (0, 0, 0, 0))
    if not bbox:
        return output

    crop = frame.crop(bbox)
    max_width = cell_width - 10
    max_height = cell_height - 8
    scale = min(max_width / crop.width, max_height / crop.height, 1.0)
    next_size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    if next_size != crop.size:
        crop = crop.resize(next_size, Image.Resampling.LANCZOS)

    x = (cell_width - crop.width) // 2
    y = cell_height - crop.height - 4
    output.alpha_composite(crop, (x, y))
    return output


def connected_components(image):
    alpha = image.getchannel("A")
    width, height = image.size
    data = alpha.tobytes()
    visited = bytearray(width * height)
    components = []

    for start, alpha_value in enumerate(data):
        if alpha_value <= 16 or visited[start]:
            continue

        stack = [start]
        visited[start] = 1
        pixels = []
        min_x = width
        min_y = height
        max_x = 0
        max_y = 0

        while stack:
            current = stack.pop()
            pixels.append(current)
            x = current % width
            y = current // width
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)

            if x > 0:
                neighbor = current - 1
                if not visited[neighbor] and data[neighbor] > 16:
                    visited[neighbor] = 1
                    stack.append(neighbor)
            if x + 1 < width:
                neighbor = current + 1
                if not visited[neighbor] and data[neighbor] > 16:
                    visited[neighbor] = 1
                    stack.append(neighbor)
            if y > 0:
                neighbor = current - width
                if not visited[neighbor] and data[neighbor] > 16:
                    visited[neighbor] = 1
                    stack.append(neighbor)
            if y + 1 < height:
                neighbor = current + width
                if not visited[neighbor] and data[neighbor] > 16:
                    visited[neighbor] = 1
                    stack.append(neighbor)

        components.append({
            "pixels": pixels,
            "area": len(pixels),
            "bbox": (min_x, min_y, max_x + 1, max_y + 1),
            "center_x": (min_x + max_x + 1) / 2,
        })

    return components


def component_group_image(source, components, padding=4):
    width, height = source.size
    min_x = max(0, min(component["bbox"][0] for component in components) - padding)
    min_y = max(0, min(component["bbox"][1] for component in components) - padding)
    max_x = min(width, max(component["bbox"][2] for component in components) + padding)
    max_y = min(height, max(component["bbox"][3] for component in components) + padding)

    output = Image.new("RGBA", (max_x - min_x, max_y - min_y), (0, 0, 0, 0))
    source_pixels = source.load()
    output_pixels = output.load()
    for component in components:
        for pixel_index in component["pixels"]:
            x = pixel_index % width
            y = pixel_index // width
            output_pixels[x - min_x, y - min_y] = source_pixels[x, y]
    return output


def extract_component_frames(strip, state, atlas):
    components = connected_components(strip)
    if not components:
        return None

    frame_count = state["frames"]
    largest_area = max(component["area"] for component in components)
    seed_threshold = max(120, largest_area * 0.20)
    seeds = [component for component in components if component["area"] >= seed_threshold]
    if len(seeds) < frame_count:
        seeds = sorted(components, key=lambda component: component["area"], reverse=True)[:frame_count]
    if len(seeds) < frame_count:
        return None

    seeds = sorted(
        sorted(seeds, key=lambda component: component["area"], reverse=True)[:frame_count],
        key=lambda component: component["center_x"],
    )
    return [
        fit_to_cell(
            component_group_image(strip, [seed]),
            atlas["cellWidth"],
            atlas["cellHeight"],
        )
        for seed in seeds
    ]


def main_component_in_slot(slot, atlas):
    components = connected_components(slot)
    if not components:
        return fit_to_cell(slot, atlas["cellWidth"], atlas["cellHeight"])
    width, _ = slot.size
    largest_area = max(component["area"] for component in components)
    candidates = [
        component for component in components
        if component["bbox"][0] > 0
        and component["bbox"][2] < width
        and component["area"] >= largest_area * 0.20
    ]
    if not candidates:
        candidates = components
    seed = max(candidates, key=lambda component: component["area"])
    return fit_to_cell(
        component_group_image(slot, [seed]),
        atlas["cellWidth"],
        atlas["cellHeight"],
    )


def source_for_state(run_dir, state_name):
    state_dir = run_dir / "provider/rows" / state_name
    candidates = sorted(state_dir.glob(f"{state_name}_*.png"))
    if not candidates:
        candidates = sorted(state_dir.glob("*.png"))
    response = state_dir / f"{state_name}_response.json"
    return (candidates[0] if candidates else None), response


def extract_row(strip_path, state, atlas, key, threshold):
    strip = remove_chroma(Image.open(strip_path), key, threshold)
    component_frames = extract_component_frames(strip, state, atlas)
    if component_frames:
        return component_frames

    frames = state["frames"]
    slot_width = strip.width / frames
    output_frames = []
    for index in range(frames):
        left = round(index * slot_width)
        right = round((index + 1) * slot_width)
        slot = strip.crop((left, 0, right, strip.height))
        output_frames.append(main_component_in_slot(slot, atlas))
    return output_frames


def write_contact_sheet(frames_by_state, atlas, output_path, background):
    rows = len(frames_by_state)
    width = atlas["columns"] * atlas["cellWidth"]
    height = rows * atlas["cellHeight"]
    sheet = Image.new("RGBA", (width, height), background)
    for row_index, (_, frames) in enumerate(frames_by_state):
        for col, frame in enumerate(frames):
            sheet.alpha_composite(frame, (col * atlas["cellWidth"], row_index * atlas["cellHeight"]))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output_path)


def cover_resize(image, width, height):
    scale = max(width / image.width, height / image.height)
    resized = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )
    left = (resized.width - width) // 2
    top = (resized.height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def write_room_contact_sheet(frames_by_state, atlas, output_path, room_background_path):
    room = Image.open(room_background_path).convert("RGBA")
    cell_background = cover_resize(room, atlas["cellWidth"], atlas["cellHeight"])
    rows = len(frames_by_state)
    width = atlas["columns"] * atlas["cellWidth"]
    height = rows * atlas["cellHeight"]
    sheet = Image.new("RGBA", (width, height), (0, 0, 0, 255))

    for row_index, (_, frames) in enumerate(frames_by_state):
        for col, frame in enumerate(frames):
            x = col * atlas["cellWidth"]
            y = row_index * atlas["cellHeight"]
            sheet.alpha_composite(cell_background, (x, y))
            sheet.alpha_composite(frame, (x, y))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output_path)


def write_row_gif(frames, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frames = [frame.copy() for frame in frames]
    frames[0].save(
        output_path,
        save_all=True,
        append_images=frames[1:],
        duration=160,
        loop=0,
        disposal=2,
    )


def response_prompt(response_path):
    if not response_path.is_file():
        return None
    data = load_json(response_path)
    prompt = (data.get("request") or {}).get("prompt")
    return prompt if isinstance(prompt, str) else None


def main():
    parser = argparse.ArgumentParser(description="Build the Neta 15-row sprite production atlas.")
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--contract", default=str(DEFAULT_CONTRACT))
    parser.add_argument("--states", help="Comma-separated state names for partial extraction.")
    parser.add_argument("--allow-missing", action="store_true")
    args = parser.parse_args()

    run_dir = rel(ROOT, args.run_dir)
    contract = load_json(rel(ROOT, args.contract))
    atlas = contract["atlas"]
    key = parse_hex(contract["background"]["primary"]["hex"])
    threshold = float(contract["qualityGate"].get("providerChromaKeyDistanceThreshold", 96))
    requested = {item.strip() for item in args.states.split(",")} if args.states else None

    final_dir = run_dir / "final"
    frames_root = run_dir / "frames"
    qa_dir = run_dir / "qa"
    final_dir.mkdir(parents=True, exist_ok=True)
    frames_root.mkdir(parents=True, exist_ok=True)
    qa_dir.mkdir(parents=True, exist_ok=True)

    atlas_image = Image.new("RGBA", (atlas["width"], atlas["height"]), (0, 0, 0, 0))
    frames_by_state = []
    provider_sources = []
    source_prompts = []
    missing = []

    for state in contract["states"]:
        if requested and state["name"] not in requested:
            continue
        source_path, response_path = source_for_state(run_dir, state["name"])
        if source_path is None:
            missing.append(state["name"])
            if args.allow_missing:
                continue
            raise SystemExit(f"missing provider row for {state['name']}")

        frames = extract_row(source_path, state, atlas, key, threshold)
        state_frame_dir = frames_root / state["name"]
        state_frame_dir.mkdir(parents=True, exist_ok=True)
        for index, frame in enumerate(frames):
            frame.save(state_frame_dir / f"{index:02d}.png")
            atlas_image.alpha_composite(frame, (index * atlas["cellWidth"], state["row"] * atlas["cellHeight"]))

        frames_by_state.append((state["name"], frames))
        provider_sources.append(str(source_path.relative_to(run_dir)))
        prompt = response_prompt(response_path)
        if prompt:
            source_prompts.append(prompt)
        write_row_gif(frames, qa_dir / "videos" / f"{state['name']}.gif")

    final_sheet = final_dir / "spritesheet.webp"
    atlas_image.save(final_dir / "spritesheet.png")
    atlas_image.save(final_sheet, lossless=True, quality=100)

    write_contact_sheet(frames_by_state, atlas, qa_dir / "contact-black.png", (0, 0, 0, 255))
    write_contact_sheet(frames_by_state, atlas, qa_dir / "contact-orange.png", (255, 136, 0, 255))
    write_room_contact_sheet(frames_by_state, atlas, qa_dir / "contact-room.png", DEFAULT_ROOM_BACKGROUND)

    manifest = {
        "schemaVersion": "neta.sprite-production.run.v1",
        "productionMode": True,
        "sourceBackground": {
            "kind": "chroma-key",
            "hex": contract["background"]["primary"]["hex"],
            "threshold": threshold,
        },
        "sourcePrompts": source_prompts,
        "providerSources": provider_sources,
        "extractedFramesDir": "frames",
        "finalSheet": "final/spritesheet.webp",
        "qa": {
            "composites": [
                "qa/contact-black.png",
                "qa/contact-orange.png",
                "qa/contact-room.png"
            ],
            "playback": [
                str(path.relative_to(run_dir)) for path in sorted((qa_dir / "videos").glob("*.gif"))
            ],
        },
        "missingStates": missing,
    }
    (run_dir / "sprite-production-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(json.dumps({
        "ok": True,
        "runDir": str(run_dir),
        "states": [name for name, _ in frames_by_state],
        "missing": missing,
        "finalSheet": str(final_sheet),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
