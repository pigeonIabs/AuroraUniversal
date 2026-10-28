# Aurora launch studio

The launch uses real signed-out pages with Aurora installed. Each website fills the frame. An isolated authoring profile under `work/universal-launch/` keeps personal browser data out of the footage.

Install Node.js, Python, FFmpeg, and the dependencies, then build the development package from the repository root.

```sh
python scripts/build_xpi.py --output build/aurora-universal-development.xpi
cd release/studio
npm ci
npx playwright install firefox
python -m pip install -r requirements.txt
node capture-launch.cjs
```

Run `node server.cjs` in a separate terminal. Then render the extension's own backgrounds and assemble the film.

```sh
node render-scenes.cjs
node assemble-launch.cjs
```

The capture clears the isolated profile's cookies, applies explicit background settings, dismisses native cookie notices, and records 1080p footage. It never submits prompts or signs in. Set `CAPTURE_SITES` to a comma-separated list of site IDs to refresh selected footage. Raw recordings and inspection data remain in `work/`. Only selected exports belong in `release/media/`.

`scene.html` uses the production background renderer for standalone media and the closing title. `assemble-launch.cjs` defines the accelerating edit and creates the H.264 MP4 and looping GIFs. `capture.cjs` and `render.cjs` retain the earlier Qwen and Grok demonstration.

The four scenic backgrounds can be regenerated with `python scripts/generate_theme_art.py` from the repository root using NumPy and Pillow. Runtime motion uses two baked WebP layers and CSS transforms.

`python scripts/prepare_release.py` refreshes the XPI, source package, press kit, and checksums without publishing. The development XPI preserves the local LibreWolf identity. The versioned distribution XPI uses the public Aurora Universal identity.
