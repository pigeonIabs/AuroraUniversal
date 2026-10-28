#!/usr/bin/env python3
"""Assemble local release packages. This command never publishes anything."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from build_xpi import ROOT, build, collect_files, write_archive


def prepare() -> None:
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    version = manifest['version']
    destination = ROOT / 'build'
    package = destination / f'aurora-universal-{version}.xpi'
    build(package)
    build(destination / 'aurora-universal-development.xpi', 'aurora-for-chatgpt-librewolf@local')

    sources = collect_files(manifest)
    for name in ('.gitignore', '.gitattributes', 'README.md', 'DEVELOPMENT.md', 'amo-metadata.json',
                 'scripts/build_xpi.py', 'scripts/prepare_release.py', 'scripts/generate_theme_art.py', 'release/index.html'):
        sources[name] = ROOT / name
    for pattern in ('release/*.md', 'release/studio/*', 'release/media/*'):
        for path in ROOT.glob(pattern):
            if path.is_file():
                sources[path.relative_to(ROOT).as_posix()] = path
    source_archive = destination / f'aurora-universal-{version}-source.zip'
    write_archive(source_archive, sources)

    media = {'media/' + path.name: path for path in (ROOT / 'release/media').iterdir() if path.is_file()}
    staging = ROOT / 'work/release-packaging'
    staging.mkdir(parents=True, exist_ok=True)
    gallery = (ROOT / 'release/index.html').read_text(encoding='utf-8')
    (staging / 'index.html').write_text(gallery.replace('../assets/fonts/inter-6.woff2', 'fonts/inter-6.woff2'), encoding='utf-8')
    media.update({
        'index.html': staging / 'index.html',
        'README.md': ROOT / 'release/MEDIA.md',
        'LICENSE': ROOT / 'LICENSE',
        'fonts/inter-6.woff2': ROOT / 'assets/fonts/inter-6.woff2',
        'fonts/inter-OFL.txt': ROOT / 'assets/fonts/inter-OFL.txt',
    })
    press_archive = destination / f'aurora-universal-{version}-press-kit.zip'
    write_archive(press_archive, media)

    artifacts = [package, source_archive, press_archive,
                 *[ROOT / 'release/media' / name for name in ('aurora-universal-launch.mp4',
                   'aurora-space-timelapse.mp4', 'aurora-animated-gradient.mp4')]]
    checksums = []
    inventory = []
    for path in artifacts:
        if not path.is_file():
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        name = path.name
        checksums.append(f'{digest}  {name}')
        inventory.append({'file': name, 'bytes': path.stat().st_size, 'sha256': digest})
    (destination / 'SHA256SUMS').write_text('\n'.join(checksums) + '\n', encoding='utf-8')
    (destination / 'release-inventory.json').write_text(json.dumps({
        'name': 'Aurora Universal', 'version': version,
        'extensionId': manifest['browser_specific_settings']['gecko']['id'],
        'signed': False, 'artifacts': inventory
    }, indent=2) + '\n', encoding='utf-8')
    print(f'Prepared Aurora Universal {version} locally')
    for path in (package, source_archive, press_archive):
        print(f'{path.name}  {path.stat().st_size:,} bytes')


if __name__ == '__main__':
    prepare()
