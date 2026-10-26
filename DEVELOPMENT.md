# Development

Aurora Universal is a Firefox extension written in plain JavaScript and CSS. Runtime code ships as readable source without a compilation step or remote scripts.

## Build

```sh
python scripts/build_xpi.py
python scripts/build_xpi.py --output build/aurora-universal-development.xpi
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

## Working rules

**Preserve native geometry.** Glass changes fill, tint, transparency, border color, shadows, and backdrop blur. Website shape, spacing, typography, icons, and hit areas remain native. Focus mode and cinema width are separate features with separate settings.

**Share page work.** Use the existing observer. New branches, changed state, and changed text have distinct update paths. Do not rescan unchanged conversations. Keep DOM reads together, coalesce material writes, and yield expensive overlap discovery in bounded slices.

**Respect lifecycle.** Hidden tabs retain pending changes until visible. Disabling Aurora stops observers and restores owned changes. Background replacements keep the active media until the new source is ready.

**Protect drafts.** Queue work belongs to one conversation. Navigation or disabling clears pending work. Use native send controls, prevent duplicate submissions, and pause uncertain sends for explicit retry.

**Keep data local.** Preferences use browser storage. Uploaded media stays local. Page capabilities determine which settings appear. See [Privacy](PRIVACY.md) for the data flow and network exceptions.

## Releases

Read the version and extension ID from `manifest.json` in release tooling.

Create tags, push changes, submit to Mozilla, or publish releases only when explicitly requested. Live UI acceptance belongs to the user's testing pass. Limit automated checks to critical startup or installation requirements when necessary.
