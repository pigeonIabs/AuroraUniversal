# Development

Aurora Universal is a Firefox extension written in plain JavaScript and CSS. Runtime code ships as readable source without a compilation step or remote scripts.

## Build

```sh
python scripts/build_xpi.py
python scripts/build_xpi.py --output build/aurora-universal-development.xpi
python scripts/build_xpi.py --output build/aurora-glass-slider-development.xpi --gecko-id aurora-for-chatgpt-librewolf@local
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
| `modules/aurora/central-observer.js` | Shared incremental page observation |
| `modules/aurora/material.js` | Native paint ownership |
| `modules/aurora/text-frost.js` | Readability over overlapping text |
| `modules/aurora/orchestrator.js` | Feature lifecycle and update scheduling |
| `modules/message-queue.js` | Conversation-scoped queued messages |
| `popup.html`, `popup.js`, `popup.css` | Toolbar settings |

Content scripts load at `document_start` in dependency order. The background mounts as soon as preferences arrive and moves into the body when available. The shared observer discovers native surfaces incrementally. Masking and message queues load only when enabled.

Settings edits use `preferences.save` with the target website ID. Websites inherit the shared baseline unless a setting has a different website override. The existing `siteAppearance:<id>` records retain sparse differences for appearance, behavior, and privacy controls. Glass style and transparency form one setting, as do a background source and its uploaded media key. Old complete appearance records resolve as differences without changing the stored data during installation.

The popup initially selects the active website. Edits from this initial view update inherited values together and preserve existing overrides. Manually selecting a website targets its own settings. Matching the shared value removes an override, and when all websites match, that value becomes their shared baseline. No sharing preference or switch is used. The background serializes edits and removes redundant overrides. Startup, runtime updates, quick settings, onboarding, and keyboard shortcuts use the same resolver. Upload tabs retain their target and edit scope in the URL and use immutable local media keys. Aurora activation, website enablement, onboarding state, and the already website-specific model map remain global bookkeeping.

Glass uses one clear-to-dim range in the popup, quick settings, and onboarding. `preferences.glassAmount` and `glassPatch` invert the saved transparency value for the left-to-right control while preserving existing settings. `glass-control.js` shares native range behavior and the material preview thumb. Surface fill and border interpolate continuously, and blur follows the same amount. The legacy appearance value is retained for saved-setting compatibility only and does not switch background or material styling at the midpoint. Local development packages can keep the installed LibreWolf ID through `--gecko-id` while the release manifest retains its public ID.

## Working rules

**Preserve native geometry.** Glass changes fill, tint, transparency, border color, shadows, and backdrop blur. Website shape, spacing, typography, icons, and hit areas remain native. Focus mode and cinema width are separate features with separate settings.

**Share page work.** Use the existing observer. New branches, changed state, and changed text have distinct update paths. Do not rescan unchanged conversations. Keep DOM reads together, coalesce material writes, and yield expensive overlap discovery in bounded slices.

**Respect lifecycle.** Hidden tabs retain pending changes until visible. Disabling Aurora stops observers and restores owned changes. Background replacements keep the active media until the new source is ready.

**Protect drafts.** Queue work belongs to one conversation. Navigation or disabling clears pending work. Use native send controls, prevent duplicate submissions, and pause uncertain sends for explicit retry.

**Keep data local.** Preferences use browser storage. Uploaded media stays local. Page capabilities determine which settings appear. See [Privacy](PRIVACY.md) for the data flow and network exceptions.

## Releases

Read the version and extension ID from `manifest.json` in release tooling.

Create tags, push changes, submit to Mozilla, or publish releases only when explicitly requested. Live UI acceptance belongs to the user's testing pass. Limit automated checks to critical startup or installation requirements when necessary.
