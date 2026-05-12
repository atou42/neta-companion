# Neta Companion

This project combines three existing pieces into one web companion direction.

`CuiMao` is the home presence layer. It keeps the gaze-following Neta as the first screen.

`Neta FM` is the radio layer. It keeps the Suno queue and browser playback flow.

`pet-foundry` is the companion asset layer. The FM page uses a Pet Foundry spritesheet as a live companion sprite that reacts to playback state.

Run locally with:

```bash
python3 -m http.server 8088
```

Then open:

```text
http://127.0.0.1:8088/
```

The original source projects are preserved under `source-projects/`.

Production is deployed with Cloudflare Workers Static Assets:

```bash
rsync -a index.html styles.css app.js public dist/
wrangler deploy --config wrangler.jsonc
```

Public URL:

```text
https://neta.atou.cc/
```
