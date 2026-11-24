# Development

Aurora Universal is a Firefox extension written in plain JavaScript and CSS. Runtime code ships as readable source. The XPI builder also derives shadow owner selectors from the bundled stylesheets.

## Build

```sh
python scripts/build_xpi.py
python scripts/build_xpi.py --output build/aurora-universal-development.xpi
python scripts/build_xpi.py --output build/aurora-glass-slider-development.xpi
python scripts/prepare_release.py
```

Python 3.9 or later is required. The builder includes runtime files, bundled assets, locales, and license notices. Documentation, launch media, local work, and development tools stay outside the XPI. File ordering, line endings, permissions, and ZIP timestamps are normalized for reproducible builds.

Keep packages in `build/` and local receipts, backups, and captures in `work/`. Both are ignored by Git. Release copy and promotional sources live in `release/`.

## Architecture

| Location | Responsibility |
| --- | --- |
| `manifest.json` | Permissions, resources, and script load order |
| `modules/aurora/sites.js` | Site registry and feature capabilities |
| `modules/aurora/adapters/` | Native surfaces, routes, composers, and controls |
| `modules/aurora/preferences.js` | Shared defaults and normalization |
| `modules/aurora/startup.js` | Early preferences and background mounting |
| `modules/aurora/wallpaper-renderer.js` | Shared visibility, size, and lifecycle for wallpaper workers |
| `modules/aurora/wallpaper-worker.js` | Offscreen rendering and compositor bitmap presentation |
| `modules/aurora/wallpaper-frame.*` | Extension-origin worker ownership, isolated from website worker policies |
| `modules/aurora/*-painter.js` | Original Northern Lights and Deep Ocean WebGL and Canvas equations |
| `modules/aurora/central-observer.js` | Shared incremental page observation |
| `modules/aurora/material.js` | Native paint ownership |
| `modules/aurora/text-frost.js` | Readability over overlapping text |
| `modules/aurora/orchestrator.js` | Feature lifecycle and update scheduling |
| `modules/message-queue.js` | Conversation-scoped queued messages |
| `popup.html`, `popup.js`, `popup.css` | Toolbar settings |

Content scripts load at `document_start` in dependency order. The background mounts as soon as preferences arrive and moves into the body when available. The shared observer discovers native surfaces incrementally. Masking and message queues load only when enabled.

Northern Lights evaluates a continuous radiance field over a quiet star field. Two broad auroral curtains retain soft cyan, mint, and violet emission with unequal bends and slowly shifting brightness. A richer deterministic star field and blue horizon give the sky depth. The lower scene is only a barely perceptible mountain and forest silhouette. All terrain uses the same near-black blue, no illuminated facets, softly feathered edges, and baked alpha from 10 to 22 out of 255. Never restore opaque terrain, bright mountain faces, or high-contrast tree outlines. The transparent WebP foreground and composite thumbnail share this low contrast. The landscape always occupies the lower viewport and is included in live theme previews and the composite thumbnail. A single viewport-covering triangle replaces the former folded mesh, so no sheet intersections or tessellation edges enter the image. The field uses a shared 64 KB deterministic noise texture and stable sub-LSB dithering to reduce contour banding. The Canvas fallback evaluates the same field and reconstructs it with filtered interpolation instead of drawing polygon strips. Both renderers cap resolution and frame rate, pause when hidden or outside the viewport, honor reduced motion and disabled animations, and release resources when the background is replaced. Theme previews use the same renderer at a smaller drawing resolution. Intrinsic feathering does not depend on the motion blur setting. Regenerate only its bundled startup artwork with `python scripts/generate_theme_art.py --theme northern-lights`. No video is bundled or downloaded.

Settings edits use `preferences.save` with the target website ID. Websites inherit the shared baseline unless a setting has a different website override. The existing `siteAppearance:<id>` records retain sparse differences for appearance, behavior, and privacy controls. Glass style and transparency form one setting, as do a background source and its uploaded media key. Old complete appearance records resolve as differences without changing the stored data during installation.

The popup initially selects the active website. Edits from this initial view update inherited values together and preserve existing overrides. Manually selecting a website targets its own settings. Matching the shared value removes an override, and when all websites match, that value becomes their shared baseline. No sharing preference or switch is used. The background serializes edits and removes redundant overrides. Startup, runtime updates, quick settings, onboarding, and keyboard shortcuts use the same resolver. The popup opens a native file picker and stores uploaded media under immutable local keys with the selected site and edit scope. Aurora activation, website enablement, onboarding state, and the already website-specific model map remain global bookkeeping.

Glass uses one clear-to-dim range in the popup, quick settings, and onboarding. `preferences.glassAmount` and `glassPatch` invert the saved transparency value for the left-to-right control while preserving existing settings. `glass-control.js` shares native range behavior, a circular glass thumb, and an unfilled track between glass intensity and background blur. Surface fill and border interpolate continuously. Clear tint is 1.5%; dim tint remains translucent at 22–28%. The popup has no full-pane backdrop blur over its background. Popup changes preview on open sites while dragging and persist on commit. Still-image and glass blur use `backgroundBlur`, defaulting to 50px. Videos, GIFs, and all animated presets use `motionBackgroundBlur`, defaulting to 0px. The existing blur control edits the selected background kind without overwriting the other value. Loaded local media determines its kind before the control is synchronized. Website glass keeps its own image/glass blur value while moving background media stays sharp. The theme gallery uses the website renderer in a reduced viewport, so its image crop, layers, and motion scale together. Gallery previews keep a fixed 50px image blur before viewport scaling and no added motion blur, independently of saved settings and live blur adjustments. These values belong to the preview surface and have no user preference. The native website viewport and responsive image sources are unchanged. The legacy appearance value is retained for saved-setting compatibility only and does not switch background or material styling at the midpoint. All Universal packages use `aurora-universal@pigeonlabs`, including local development builds. Legacy Aurora has a separate identity and version history. Never reuse its ID or compare its versions with Universal. The builder rejects that legacy ID, and release preparation uses the manifest identity. Keep normal automatic updates enabled for Universal.

Dawn preserves the original abstract procedural design, cloud contours, and diffuse lighting field. Its color ramp passes through violet, orchid, rose, and apricot instead of mixing purple directly into pale peach. The original illumination field blends toward warm apricot instead of screening toward white. The unchanged cloud field carries lavender shadows, orchid midtones, and rose-peach highlights, keeping color separation soft without washing the whole cloud bank into grey-pink. Do not add a literal sun, realistic sky imagery, or new cloud layers. Its deterministic noise stream preserves the original cloud shapes independently of which other themes are generated. Regenerate its full-size layers, composite preview, and thumbnails with `python scripts/generate_theme_art.py --theme dawn`.

## Working rules

Deep Ocean's incoming illumination spans the complete unseen surface. Thirteen irregularly weighted shaft origins extend from outside the left edge to outside the right edge, with a shared general sunlight direction. Broad skylight replaces the former localized aperture and central halo. The shader and Canvas renderer use the same beam table, and the artwork generator reads that JSON literal directly from the runtime source. The original subtle bubble settings are independent of these lighting changes.

Deep Ocean retains the original 14 subtle bubbles and 42 faint motes, including their original radius, alpha, drift, and center attenuation. No animal is drawn. The shafts now animate their origins, entire straight centerlines, focus widths, and traveling internal highlights independently, with roughly 7–23 second cycles instead of nearly imperceptible angle changes over two minutes. A Canvas fallback reconstructs the same light field using cross-shaft lookup tables when WebGL cannot initialize, so the normal fallback remains animated. Both renderers share the visibility, reduced-motion, and disabled-animation lifecycle. Regenerating the startup assets evaluates the current equations at the same initial time.

Deep Ocean preserves the original dark teal open-water style with no visible surface. `modules/aurora/deep-ocean.js` computes soft straight shafts from an unseen overhead light source. Every shaft has a linear centerline, feathered scattering, depth attenuation, and independent slow illumination changes. Refraction varies each entire shaft's angle slightly, never bending its path through the water. The live renderer caps resolution and frame rate, pauses while hidden or inactive, honors reduced motion, and releases its resources on replacement or disable. Its fallback and thumbnails are deterministic renders of the same equations at the initial time, created by `python scripts/generate_theme_art.py --theme deep-ocean`. Lossless WebP preserves gradient dithering. There are no photographic assets, image-generation dependencies, surface textures, or remote media.

Northern Lights and Deep Ocean render exclusively in dedicated workers. Main-thread modules only manage visibility and lifecycle. The original shader and Canvas equations live in the matching `*-painter.js` files, including the ocean beam literal consumed by the artwork baker. `OffscreenCanvas` and ownership-transferred compositor bitmaps keep both GPU drawing and software fallback pixel loops off the page thread, without pixel readbacks or per-frame messages. Existing resolution budgets, fallback sampling, dithering, particle counts, and frame rates stay unchanged. Time-only ocean beam parameters are uniforms calculated once per frame. Static fallback coordinates and dither are cached. Workers start lazily for visible, active scenes, schedule only actual drawing frames, pause completely while hidden or suspended, and terminate on replacement or disable. Never reintroduce per-pixel JavaScript on the website main thread or reduce visual quality to address scheduling problems.

**Preserve native geometry.** Glass changes fill, tint, transparency, border color, shadows, and backdrop blur. Website shape, spacing, typography, icons, and hit areas remain native. Focus mode and cinema width are separate features with separate settings.

ChatGPT's outer footer paint owner is the direct parent of `[data-thread-scroll-footer]`. Its CSS-module class is unstable. The shared scroll-edge layer clears this parent's fill and both pseudo-element fills, including the native black gradient and solid bottom strip, while preserving their geometry and the nested composer material. Keep the non-inheriting scroll-edge marker on this owner so material discovery cannot restore its page decoration as glass.

Gemini's `chat-window > .lm-glow` is an empty decorative layer. Its `::before` paints a masked radial color field and its `::after` paints the bloom using `glow_mask.svg`. Task mode changes the color field through `.is-remy-mode`. The `geminiBloom` preference defaults to false and appears only in Gemini's toolbar and quick settings. Edits save to Gemini's site record. The root bloom attribute restores native paint when enabled. Otherwise clear both pseudo-element backgrounds only while Aurora is active. Preserve their native geometry and leave shared accent tokens intact.

Gemini's `chat-spark-toggle` uses an opaque surface token in the segmented row's native alpha mask. Keep that token opaque within this row and supply glass fill directly to its existing moving selection. The selected button stays transparent above this single paint owner. The row, channel, and custom-element button hosts are layout planes. Do not add outer shadows, shared rails, wrapper blur, or a second selection fill. Preserve native masks, corners, sizes, spacing, and slider motion.

Inline editors share native paint discovery across every adapter. Replacement editors resolve their existing field or form separately from the bottom composer and user-message glass preference. Only their live branches observe paint changes. ChatGPT Health, Study, Learn, Plugins, and Skills classify existing painted, edged surfaces within their section, including CSS-module cards. Generic surface utilities must not be cleared globally before paint ownership is measured. Only identified application layout planes and square sticky page headers reveal the wallpaper directly.

Aurora casts website surface shadows in a pointer-transparent top layer per document. Use the shared `--aurora-cast-*` variables for outer paint and keep inset edges and native focus rings in the surface rule. The variables are transparent paint markers. The compositor reads the winning marker, then draws the actual shadow from the native bounds, corner radii, and opacity. Website overflow, masks, and paint containment cannot clip that layer at the owner. The XPI builder indexes owner selectors from their CSS declarations and rejects outer website shadows that bypass the compositor. For material styles injected into embedded documents or shadow roots, pass the style's owner selector to the same compositor. Disabling Aurora removes the detached layer.

ChatGPT attaches detached shadow groups to native scroll timelines where Gecko supports them. Measure shadow geometry in scroll content coordinates so Gecko can advance the top layer with the text while the page thread is busy. The scrollport limits paint at the viewport boundary. The native control, its hitbox, and intermediate overflow wrappers do not clip the detached shadow.

ChatGPT transcript glass uses tint, the native edge treatment, and detached shadows. Keep live backdrop filters off Aurora-painted message surfaces, including generated cards and code blocks. Background blur on the wallpaper and live backdrops on floating UI are handled separately.

**Share page work.** Use the existing observer. New branches, changed state, and changed text have distinct update paths. Do not rescan unchanged conversations. Keep DOM reads together, coalesce material writes, and yield expensive overlap discovery in bounded slices.

**Respect lifecycle.** Hidden tabs retain pending changes until visible. Disabling Aurora stops observers and restores owned changes. Background replacements keep the active media until the new source is ready.

**Protect drafts.** Queue work belongs to one conversation. Navigation or disabling clears pending work. Use native send controls, prevent duplicate submissions, and pause uncertain sends for explicit retry.

**Keep data local.** Preferences use browser storage. Uploaded media stays local. Page capabilities determine which settings appear. See [Privacy](PRIVACY.md) for the data flow and network exceptions.

## Releases

Read the version and extension ID from `manifest.json` in release tooling.

Create tags, push changes, submit to Mozilla, or publish releases only when explicitly requested. Live UI acceptance belongs to the user's testing pass. Limit automated checks to critical startup or installation requirements when necessary.
