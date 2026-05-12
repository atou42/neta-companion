# Sprite Production Flow

This project treats sprite work as two separate phases.

Concept work is allowed to be loose. A concept can use a short prompt, a transparent background, or a clean light background. Its only job is to find the right character direction. A concept image must not be copied into `public/foundry/companion-spritesheet.webp`.

Production work is stricter. A production sprite source must use a flat chroma-key background selected by `public/foundry/sprite-production.json`. For Frieren, the default key is pure magenta `#FF00FF`. The prompt must forbid that key color and close colors inside the character, props, highlights, shadows, and effects.

The production run must keep provider originals, prompts, extracted frames, alignment output, final sheet, composite previews, playback previews, and a run manifest. The manifest file is named `sprite-production-manifest.json` and is validated by `scripts/validate_sprite_production.py`.

The final public sheet must only be promoted from a validated production run. If the run was generated from a transparent background, white background, light background, local drawing, local patched cells, or missing provider provenance, it is not a production source. Fix the generation flow instead of patching the public sheet.

Effects should stay out of the sprite sheet when they can be done in the frontend. Status rings, glow, particles, signal noise, and floor marks belong in CSS. The sheet should hold the character, outfit, hair, staff, and only hard-edged attached effects. This keeps cutout quality and frame alignment stable.

For white-haired or white-clothed characters, never remove white as a background. White is part of the character. The correct cleanup is chroma removal first, then edge decontamination on pixels touching transparency, then small-speck cleanup, then body-anchor alignment.

Before any replacement goes live, validate the candidate sheet against the contract, then inspect black, orange, and room-background composites, and play the animation at the real site scale. If those checks disagree with the contract, update the contract or regenerate the run. Do not bypass the gate.

Minimum command for the current public asset shape:

```bash
python3 scripts/validate_sprite_production.py --asset-only
```

Minimum command for a future production run:

```bash
python3 scripts/validate_sprite_production.py --run-dir output/sprite-production/<run-name> --strict
```

Promote a validated run to the public sheet:

```bash
python3 scripts/validate_sprite_production.py --run-dir output/sprite-production/<run-name> --strict --promote
```

