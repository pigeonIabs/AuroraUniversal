# Live product capture

The release images and film show the real Qwen and Grok new-chat pages with Aurora Universal 1.0.0 applied. Both sites are signed out. No prompts are submitted, and no personal browser profile or conversations are used.

The interface fills the frame. Native model menus and Aurora's quick settings are operated during recording. Editing adds gentle camera movement, a visible cursor, a crossfade between websites, and original ambient audio. The images contain only the live website.

## Capture and export

Install Node.js, Python, FFmpeg, and the capture dependencies, then run from this folder.

```sh
npm ci
npx playwright install firefox
python -m pip install -r requirements.txt
npm run capture
npm run render
```

Build the development XPI first with `python scripts/build_xpi.py --output build/aurora-universal-development.xpi` from the repository root.

The capture uses a dedicated Firefox profile under `work/`, clears its cookies, and requires a visible sign-in control before recording. It loads the actual XPI through Firefox's temporary add-on support. The normal LibreWolf installation is not involved.

Screenshots are 3840 × 2160. The edited film is 1920 × 1080 at 30 fps. WebP copies are 1920 × 1080, and the social crop is 1200 × 630. Exports are in `release/media/`; raw takes and the capture receipt remain in ignored `work/`.

`npm run preview` serves the gallery locally. `python scripts/prepare_release.py` refreshes the source package, press kit, and checksums without publishing.
