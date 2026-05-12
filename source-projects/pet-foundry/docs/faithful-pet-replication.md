# Faithful Pet Replication

This layer exists to stop Asset Forge from drifting away from the original hatch-pet contract.

The first target is not a generalized game sprite pipeline. The first target is a faithful local copy of the upstream `hatch-pet` capability:

- 8 columns, 9 rows.
- 192 x 208 cells.
- 1536 x 1872 final atlas.
- The original row names, frame counts, and row order.
- Base pet first.
- Grounded row-strip jobs.
- Layout guides per row.
- Chroma-key extraction.
- Component-first frame extraction.
- `inspect_frames.py` review before atlas composition.
- Transparent unused cells.
- Contact sheet.
- Validation JSON.
- Optional preview videos and pet packaging.

The upstream skill is vendored under:

```text
vendor/openai-skills/hatch-pet/
```

`asset_forge.faithful_pet` is intentionally a thin locator and contract module. It does not redraw, warp, synthesize, or locally invent row visuals.

## Acceptance

Run:

```bash
python scripts/run_faithful_pet_acceptance.py
python -m unittest tests/test_faithful_pet.py -v
```

The acceptance run uses synthetic test sources only to exercise the deterministic upstream pipeline. It does not prove visual quality. It proves that the vendored pipeline still produces the original artifact shape and fails through the original review/validation path.

Production acceptance must use real generated asset test cases. Synthetic fixtures are allowed only for tooling regressions, contract checks, and debugging validator behavior. They must not be used as final evidence that a sprite row, action pack, or visual style is accepted.

Production sprite generation should default to the original hatch-pet logic unless a later phase proves a stricter replacement. The required pattern is: canonical base first, row prompts grounded on that base, row-specific layout guide input, provider provenance recorded outside the run directory, component-first extraction, slot fallback treated as a repair signal, deterministic atlas assembly, machine review, contact-sheet review, and repair/regenerate loops before acceptance. Prompt-only horizontal strips are exploratory and must not be treated as the production path.

Visual generation work must still use the same rule, regardless of provider:

```text
base identity -> row-strip provider jobs -> record results -> finalize_pet_run.py
```

Any row whose height, baseline, identity, crop, alpha, or semantics drift is bad must be repaired or regenerated as a row. It must not be covered up with local procedural animation.

## Provider Provenance

`built-in-imagegen` and `image2` are accepted visual providers.

`built-in-imagegen` keeps the original upstream constraint: the selected source must be the original `$CODEX_HOME/generated_images/.../ig_*.png` file.

`image2` uses the same boundary, but with its own provenance. Record image2 outputs with:

```bash
python vendor/openai-skills/hatch-pet/scripts/record_imagegen_result.py \
  --run-dir <run> \
  --job-id <job> \
  --source <image2-output> \
  --provider image2 \
  --provider-metadata <image2-response-json>
```

For `image2`, the response JSON must be the original metadata written by the `image2` skill. It must list the selected source image, contain the request model, prompt, size, and endpoint, and remain hash-stable until finalize. `finalize_pet_run.py` rejects missing metadata, metadata inside the pet run directory, metadata that no longer hashes to the recorded value, or a source image not listed in the metadata.

## Real-Run Notes

The parent process owns `imagegen-jobs.json`. Do not run `record_imagegen_result.py`, mirror derivation, repair queueing, finalization, or packaging concurrently. Row generation may be delegated, but workers must return only the selected original provider output path, any required provider metadata path, and a QA note.

Built-in image generation may return a green background with mild lighting variation even when the prompt asks for pure `#00FF00`. This is not automatically accepted as visually done, and it must not be "fixed" by locally repainting the row. Record the original source, run the upstream extraction and inspection scripts, then decide whether to regenerate or queue a row repair from the contact sheet and review output.

## Custom Action Extension

Custom character actions keep the pet boundary contract, but they use an action manifest instead of the fixed nine upstream rows. Each action owns one row, declares its frame count, fps, loop behavior, source image, and provider metadata. The current validated test uses two eight-frame rows: `slash-attack` and `energy-cast`.

The extraction path is slot-first, not component-first. Action effects such as sword arcs and energy shields can be separate components, so component grouping would incorrectly discard or merge useful motion. The validator still checks that every cell is non-empty, stays inside bounds, has enough visible pixels, has measurable motion, and differs from the other action row.

Real validation found one extra rule that is now part of the scheme: after chroma removal, the pipeline must reject visible green-screen residue and remove small isolated alpha fragments before atlas assembly. This keeps useful large VFX components while removing stray generated lines or dots.

The loader contract remains `asset-forge.character-animation.v0`: an atlas path, cell size, grid size, and an `animations` array. Sprite Sheet Lab can load the generated `final/manifest.json` and `final/zero_custom_actions_atlas.webp` directly.

### Attack Slicing Boundary

Melee attack rows are not the same as body-centered actions. A real Zero slash test showed that a 2048-wide horizontal 8-frame source gives only 256 source pixels per frame. Frames 2 through 6 touched the left or right source-cell boundary, so the source image was already unsafe before atlas assembly. Wider final cells make the preview less cramped, but they cannot recover pixels that were generated across a slot boundary.

Naive overlap slicing is rejected. Adding 32-48 pixels of source overlap pulled neighboring-frame body parts and slash fragments into the current frame. This makes the animation less clean, not more correct.

The validated attack direction is a multi-row source layout. A 4 columns x 2 rows source sheet gives each attack frame a 512 x 576 source panel, and the real generation cut cleanly into an 8-frame attack row. It removed cross-slot clipping and kept all source boundary alpha at zero. The extreme slash frame still had only 6 pixels of right-side source gutter, so production validation should require a minimum source gutter and regenerate if it fails.

A prompted 3 x 3 layout was adversarially rejected. The provider ignored the requested grid and produced a loose 4 x 2 arrangement; actual 3 x 3 cropping cut through bodies and VFX. Do not use uncommon grid layouts for attack sources unless a detector first proves the grid was followed.

The formal source-level validator now supports `sourceLayout.type = grid`. A `wide-attack` action must use grid source layout and must declare `minGutterPx`. The validator checks every source cell before final atlas assembly: non-empty cell, no alpha on source-cell boundaries, and minimum left/right/top/bottom gutter. Horizontal strip slicing is rejected for `wide-attack`.

Real validation on May 6, 2026 produced these results:

- 2K 4x2 attack, 48px gutter: rejected at source level. One frame had only 29px left gutter.
- 2K compact 4x2 attack, 48px gutter: rejected at source level. One frame touched the source cell boundary.
- 4K 4x2 attack, 120px gutter: rejected at source level. One frame had 93px left gutter.
- 4K 4x2 attack, 48px gutter: rejected at source level. One frame had only 46px left gutter, and another had only 17px right gutter.

The practical preview build used the 4K 4x2 source with a diagnostic-only 1px gutter threshold so Sprite Sheet Lab could verify 288x208 loading. That preview is not an accepted production asset. The next production route should either regenerate until the 48px source gutter passes or move attack rows to per-frame generation/template placement rather than relying on a single sheet prompt.

Template placement was tested as an image-to-image layout reference. The template used a 4K 4x2 green board with visible panel boundaries, safe rectangles, foot baselines, and center anchors. The provider did not copy the guide lines into the output, which is good, but it also did not obey the safe rectangles strongly enough.

Template validation results:

- No-template 4K 4x2 baseline: minimum source gutter 17px, no source-cell boundary alpha.
- 4K safe-template guided output: minimum source gutter 8px, no source-cell boundary alpha.
- 4K compact-template guided output: minimum source gutter 0px, frames 4 and 5 touched source-cell boundaries.

This means the current visual-template strategy is rejected. The model treats the guide as weak composition advice, not as a hard mask. Do not rely on colored guide boxes unless the prompt/provider can preserve hard spatial masks. The next viable non-per-frame direction is a deterministic placement/masking pipeline: generate one attack pose or source sheet, then programmatically crop, scale, and place the extracted components into a known 4x2 template, with source gutter and baseline checks after placement.

Per-frame generation was also tested as a counterexample. Eight separate 1K square frame generations were produced from the same Zero reference, then programmatically chroma-keyed, cleaned, fitted into 288x208 cells, and assembled with the existing `energy-cast` row. Hard geometry improved: every individual source frame had at least 149px source margin, final cells had no edge alpha, and Sprite Sheet Lab loaded the atlas.

The per-frame result is still rejected for production character animation. Identity and style drift appeared across frames, especially in the follow-through frame where the hair, face, and costume silhouette changed noticeably. This confirms that per-frame generation solves cutting space but creates a stronger temporal consistency problem. It can be useful for stress-testing placement and loader logic, but it should not be the default route for character sprite rows.

### Non-Combat Character Action Pack

The first non-combat expansion pack is a ten-row action set: `idle`, `walk`, `run`, `grabbed`, `talk`, `pickup`, `sit-down`, `sleep`, `eat-or-drink`, and `spawn-or-despawn`.

Validation changed the action definitions:

- `sit` is rejected as a generic looping row. It should be `sit-down`, one-shot, then hold the final frame in the loader.
- `pickup` must be key-pose driven: bend, contact, lift, recover. A slow linear body offset is too visually flat and fails motion validation.
- `walk` needs explicit stride, arm swing, and weight shift. A mild body sway is not enough.
- `idle`, `talk`, `sleep`, and `eat-or-drink` are micro-loop actions and need lower per-row motion thresholds than locomotion or transitions.
- Non-combat action packs should use all-pair row distinctness checks. Comparing only the first two rows is not enough once the manifest grows beyond two actions.

The validated shape is a 12-column x 10-row custom atlas using 192 x 208 cells. Frame counts are: `idle` 8, `walk` 8, `run` 10, `grabbed` 8, `talk` 8, `pickup` 10, `sit-down` 8, `sleep` 8, `eat-or-drink` 10, `spawn-or-despawn` 12. Looping rows are `idle`, `walk`, `run`, `grabbed`, `talk`, `sleep`, and `eat-or-drink`; one-shot rows are `pickup`, `sit-down`, and `spawn-or-despawn`.

Real image2 validation on May 7, 2026 rejected the first 10-action run. All ten generated source rows had visible chroma residue after extraction, and nine of ten horizontal strips had at least one source slot whose alpha touched a slot boundary. The diagnostic contact sheet is `validation/action10-real-v0/qa/real-diagnostic-contact.png`, with machine reports in `real-validation-report.json` and `source-slot-boundary-report.json`.

This added one stricter rule: horizontal strip sources must be checked at source-slot level before fitting into final cells. A final atlas cell can look bounded after fit-to-cell, while the original source strip already cut through a character or prop at the slot edge. The validator now rejects horizontal strip source slots with boundary alpha.

The pet-aligned real run `validation/pet-aligned-real-v0` passed after following the original flow. It generated a canonical base on a magenta chroma key, generated row strips using the canonical base plus layout guide images as inputs, derived `running-left` from `running-right`, queued a repair when the `failed` row used slot fallback, queued a manual visual repair when `jumping` drifted into a different pet identity, and finalized only after machine review and contact-sheet review passed. Final artifacts are `final/spritesheet.webp`, `final/validation.json`, `qa/review.json`, `qa/contact-sheet.png`, and `qa/videos/`.

## Companion Bridge

The fused path keeps hatch-pet as the first source profile and Pet Foundry as the outer companion/character asset package.

Use hatch-pet to complete the visual run first:

```text
base identity -> grounded row strips -> record provider outputs -> finalize_pet_run.py
```

Then wrap the finalized run as a generic companion package:

```bash
python scripts/build_companion_asset_package.py build \
  --run-dir validation/pet-aligned-real-v0 \
  --output-dir validation/pet-aligned-real-v0-asset-package

python scripts/build_companion_asset_package.py validate \
  validation/pet-aligned-real-v0-asset-package
```

The bridge writes `contract.json`, `asset.manifest.json`, `sources/hatch-pet/`, `neutral/images/spritesheet.webp`, neutral atlas and animation data, QA files, contact-sheet preview, `exports/companion/companion.json`, and the optional Codex compatibility export `exports/codex-pet/pet.json`.

The bridge does not replace Asset Forge's package discipline. It preserves the original hatch-pet evidence, checks the completed job graph, rejects synthetic sources by default, verifies every used pet cell is non-empty, verifies unused cells are transparent, and emits a Codex-ready export directory.

This is the intended fusion boundary: source profiles own character identity and row animation generation, while Pet Foundry owns package shape, hashes, QA binding, export eligibility, and downstream agent/runtime exports.
