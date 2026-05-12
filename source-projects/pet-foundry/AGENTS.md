# Agent Notes

## Image response rule

- When an image is generated or otherwise produced for the user, include it in the assistant response using Markdown image syntax, for example:

  ```markdown
  ![description](path-or-url-to-image.png)
  ```

- If a public URL is available or requested, prefer the public URL in the Markdown image link. Otherwise use the generated local file path clearly.

## Pet Foundry project rule: image2 only for real assets

This project is a Pet Foundry companion / character asset pipeline. For any real user-requested companion, pet, character, sprite, base image, row strip, spritesheet, or final asset package:

- **Use image2.**
- **Do not locally draw, synthesize, fake, patch, or procedurally generate visual asset cells as the final answer.**
- **Do not hand-edit `imagegen-jobs.json` to pretend a visual source was generated.**
- **Do not use synthetic sources except for explicit tests/acceptance/debugging.**
- **Do not present locally drawn Pillow output as a real production sprite.**
- Every real visual source must have provider provenance recorded through the project pipeline.

If image2 fails or produces unusable output, report that and retry with safer/better prompts. Do not silently switch to local drawing.

## Required runtime environment

Before generating real images, load/check image2 runtime:

```bash
cd /workspace
. .venv/bin/activate
[ -f "$HOME/.pet-foundry-image2-env" ] && . "$HOME/.pet-foundry-image2-env"

python scripts/check_image2_env.py --probe
```

Expected environment:

```bash
export CODEX_HOME="$HOME/.codex"
export PET_FOUNDRY_IMAGE2_CLI="$HOME/.codex/skills/image2/scripts/image2.py"
export TALESOFAI_IMAGE_API_KEY="..."
```

The probe must pass before real generation:

```bash
python "$PET_FOUNDRY_IMAGE2_CLI" --list-sizes
```

If the image2 CLI is missing, install or link the shared skill runtime first:

```bash
git clone https://github.com/atou42/codex-skills-shared.git ~/codex-skills-shared
cd ~/codex-skills-shared
./scripts/bootstrap_links.sh
```

## Minimal non-production self-test

This is only for checking the toolchain. It is not a real asset workflow:

```bash
cd /workspace
. .venv/bin/activate
python scripts/run_faithful_pet_acceptance.py
python3 -m unittest tests/test_faithful_pet.py -v
```

Synthetic output from this path must not be treated as a real companion asset.

## Real companion workflow with image2

### 1. Prepare a hatch-pet run

Use a legally safe, agent-neutral description. For copyrighted or named characters, create a legally distinct companion inspired by broad traits rather than an exact copy.

```bash
python vendor/openai-skills/hatch-pet/scripts/prepare_pet_run.py \
  --pet-name "Silver Elf Mage Companion" \
  --description "A compact chibi silver-haired elf mage companion with calm green eyes, white-gold mage outfit, and soft fantasy aura." \
  --pet-notes "legally distinct chibi elf mage, silver hair, green eyes, white and gold robe, readable sprite silhouette, consistent identity" \
  --output-dir runs/silver-elf-mage \
  --force
```

Check ready jobs:

```bash
python vendor/openai-skills/hatch-pet/scripts/pet_job_status.py \
  --run-dir runs/silver-elf-mage
```

### 2. Generate the canonical base with image2

```bash
python scripts/generate_hatch_pet_image2_job.py \
  --run-dir runs/silver-elf-mage \
  --job-id base \
  --output-dir provider-runs/silver-elf-mage/image2/base \
  --base-name base \
  --force
```

Inspect the generated base. If it is censored, has a hidden face, wrong silhouette, unreadable details, bad background, or is otherwise unsuitable, retry with a safer prompt. Do not proceed with a bad canonical base.

### 3. Publish/local-reference images for row generation

image2 row jobs require reference images as `http(s)` URLs. Local run references like `references/canonical-base.png`, `decoded/base.png`, and layout guides must be mapped to public URLs before row generation.

Publish the needed reference images to `/public` or another allowed public host, then create:

```json
{
  "references/canonical-base.png": "https://.../canonical-base.png",
  "decoded/base.png": "https://.../base.png",
  "references/layout-guides/idle.png": "https://.../idle-layout.png"
}
```

Save it as, for example:

```text
runs/silver-elf-mage/input-url-map.json
```

Use the `public-share` skill when publishing files from this runtime. Do not publish secrets or private metadata.

### 4. Generate every animation row with image2

Rows required by the contract:

```text
idle
running-right
running-left
waving
jumping
failed
waiting
running
review
```

Run each job through image2 and let the script automatically record provider provenance:

```bash
python scripts/generate_hatch_pet_image2_job.py \
  --run-dir runs/silver-elf-mage \
  --job-id idle \
  --output-dir provider-runs/silver-elf-mage/image2/idle \
  --input-url-map runs/silver-elf-mage/input-url-map.json \
  --base-name idle \
  --force
```

Repeat for:

```bash
for job in running-right running-left waving jumping failed waiting running review; do
  python scripts/generate_hatch_pet_image2_job.py \
    --run-dir runs/silver-elf-mage \
    --job-id "$job" \
    --output-dir "provider-runs/silver-elf-mage/image2/$job" \
    --input-url-map runs/silver-elf-mage/input-url-map.json \
    --base-name "$job" \
    --force
done
```

Important:

- `running-left` depends on `running-right`.
- If a job is not ready, run `pet_job_status.py` and satisfy dependencies first.
- If image2 returns multiple files, select one explicitly; do not record ambiguous output.
- If output is bad, retry image2; do not repair by local drawing.

### 5. Finalize the hatch-pet run

```bash
python vendor/openai-skills/hatch-pet/scripts/finalize_pet_run.py \
  --run-dir runs/silver-elf-mage
```

Expected outputs:

```text
runs/silver-elf-mage/final/spritesheet.webp
runs/silver-elf-mage/final/validation.json
runs/silver-elf-mage/qa/review.json
runs/silver-elf-mage/qa/contact-sheet.png
runs/silver-elf-mage/qa/videos/
```

The final validation and review must pass. Used cells must be non-empty. Unused cells must be transparent.

### 6. Build and validate the companion package

```bash
./scripts/build_companion_asset_package.py build \
  --run-dir runs/silver-elf-mage \
  --output-dir runs/silver-elf-mage-asset-package

./scripts/build_companion_asset_package.py validate \
  runs/silver-elf-mage-asset-package
```

Expected package structure:

```text
runs/silver-elf-mage-asset-package/
├── contract.json
├── asset.manifest.json
├── neutral/images/spritesheet.webp
├── neutral/data/atlas.json
├── neutral/data/animations.json
├── previews/contact-sheet.png
└── exports/
    ├── companion/
    │   ├── companion.json
    │   └── spritesheet.webp
    └── codex-pet/
        ├── pet.json
        └── spritesheet.webp
```

For non-Codex agents, use:

```text
exports/companion/companion.json
exports/companion/spritesheet.webp
```

For Codex App compatibility, copy:

```text
exports/codex-pet/
```

to:

```text
${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/
```

## Direct one-off image2 use

For quick image2 smoke tests or concept images not tied to a hatch-pet job:

```bash
python scripts/run_image2.py \
  --prompt "A compact chibi fantasy companion sprite, transparent background." \
  --output-dir provider-runs/smoke/image2/freeform \
  --base-name smoke-companion
```

Even for one-off images, include the generated image in the assistant response with Markdown image syntax.

## Reporting results

When returning generated assets to the user:

- Include Markdown image links for the contact sheet and/or spritesheet.
- Prefer public URLs if files were published under `/public`.
- Clearly state whether the asset is a real image2-provenance production asset or only a test/debug artifact.
- Never claim a locally drawn or synthetic artifact is an image2-generated production asset.
