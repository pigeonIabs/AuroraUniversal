# Release distribution

Aurora Universal 1.0.0 is the first Universal release. GitHub release files include an unsigned development XPI, the complete source archive, the press kit, and SHA-256 checksums.

## Firefox Add-ons

Universal uses `aurora-universal@pigeonlabs` and a separate listing. The earlier `aurora-for-chatgpt-librewolf@local` listing already has version 1.7.9. The new identity allows Universal to begin at 1.0.0. [Migration details](MIGRATION.md).

The development XPI is unsigned. Standard Firefox requires a Mozilla-signed package for permanent installation. Store submission and approval are separate from publishing the GitHub release. [Mozilla signing requirements](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

## Included material

The inherited MIT source notice and bundled font licenses are retained. The default OpenAI wallpaper loads from its original provider and is not redistributed in the package. See [third-party notices](../THIRD_PARTY_NOTICES.md).

Promotional captures show actual signed-out Qwen and Grok pages with Aurora's animated gradient. Media sources and provenance are in [the release studio](studio/README.md).

## Packaging

`python scripts/prepare_release.py` builds packages and checksums in `build/`. It does not publish. Local backups, installation receipts, and submission logs stay in ignored `work/`.
