#!/usr/bin/env python3
"""Build a reproducible XPI from this repository's extension sources."""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from typing import List, Set, Tuple


ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_PARTS = {
    ".git",
    ".pytest_cache",
    "backup",
    "backups",
    "build",
    "dist",
    "node_modules",
    "test",
    "tests",
    "venv",
    ".venv",
    "work",
    "scripts",
    "release",
    "output",
    ".github",
    "__pycache__",
}
EXCLUDED_FILES = {".gitignore", ".ds_store", "amo-metadata.json", "agents.md", "project_context.md"}
TEXT_SUFFIXES = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".md",
    ".svg",
    ".txt",
    ".xml",
}
ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
SOURCE_DIRECTORIES = ("_locales", "assets", "icons", "modules")
ROOT_SUFFIXES = {".css", ".html", ".js"}
PACKAGE_DOCUMENTS = ("LICENSE", "PRIVACY.md", "THIRD_PARTY_NOTICES.md")


def excluded(path: str) -> bool:
    package_path = PurePosixPath(path)
    lowered_parts = {part.lower() for part in package_path.parts}
    lowered_name = package_path.name.lower()
    return (
        bool(lowered_parts & EXCLUDED_PARTS)
        or lowered_name in EXCLUDED_FILES
        or lowered_name.endswith((".bak", ".orig", ".old", ".xpi"))
        or lowered_name.endswith("~")
        or package_path.as_posix() == "scripts/build_xpi.py"
    )


def safe_package_path(value: str) -> str:
    if "\\" in value:
        raise ValueError(f"Manifest path must use forward slashes: {value}")
    candidate = PurePosixPath(value)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise ValueError(f"Manifest path escapes the extension root: {value}")
    return candidate.as_posix()


def source_paths() -> List[str]:
    """Package runtime sources independently of Git's staging state."""
    paths = {"manifest.json", *PACKAGE_DOCUMENTS}
    paths.update(path.name for path in ROOT.iterdir()
                 if path.is_file() and path.suffix in ROOT_SUFFIXES)
    for directory in SOURCE_DIRECTORIES:
        for path in (ROOT / directory).rglob("*"):
            if path.is_file():
                paths.add(path.relative_to(ROOT).as_posix())
    return sorted(paths)


def manifest_references(manifest: dict) -> Tuple[Set[str], List[str]]:
    required: Set[str] = {"manifest.json"}
    patterns: List[str] = []

    def add_value(value: object) -> None:
        if isinstance(value, str):
            required.add(safe_package_path(value))
        elif isinstance(value, dict):
            for nested in value.values():
                add_value(nested)

    background = manifest.get("background", {})
    for script in background.get("scripts", []):
        add_value(script)
    add_value(background.get("service_worker"))
    add_value(background.get("page"))

    for icon in manifest.get("icons", {}).values():
        add_value(icon)

    for action_name in ("action", "browser_action", "page_action"):
        action = manifest.get(action_name, {})
        add_value(action.get("default_popup"))
        add_value(action.get("default_icon"))

    for page_key in ("options_page", "devtools_page"):
        add_value(manifest.get(page_key))
    add_value(manifest.get("options_ui", {}).get("page"))
    add_value(manifest.get("sidebar_action", {}).get("default_panel"))
    for page in manifest.get("chrome_url_overrides", {}).values():
        add_value(page)

    for content_script in manifest.get("content_scripts", []):
        for key in ("js", "css"):
            for path in content_script.get(key, []):
                add_value(path)

    for resource_set in manifest.get("web_accessible_resources", []):
        for resource in resource_set.get("resources", []):
            patterns.append(safe_package_path(resource))

    return required, patterns


def add_source_file(files: dict[str, Path], path: str) -> None:
    if excluded(path):
        return
    package_path = safe_package_path(path)
    source = ROOT.joinpath(*PurePosixPath(package_path).parts)
    if source.is_symlink():
        raise ValueError(f"Symlinked package input is not supported: {package_path}")
    if not source.is_file():
        raise ValueError(f"Package input is missing: {package_path}")
    files[package_path] = source


def collect_files(manifest: dict) -> dict[str, Path]:
    files: dict[str, Path] = {}
    for path in source_paths():
        add_source_file(files, path)

    required, patterns = manifest_references(manifest)
    for path in sorted(required):
        add_source_file(files, path)

    for pattern in patterns:
        matched = []
        for source in ROOT.glob(pattern):
            if not source.is_file():
                continue
            path = source.relative_to(ROOT).as_posix()
            if not excluded(path) and fnmatch.fnmatchcase(path, pattern):
                matched.append(path)
                add_source_file(files, path)
        if not matched:
            raise ValueError(f"Manifest resource pattern matched no package files: {pattern}")

    missing = sorted(path for path in required if path not in files)
    if missing:
        raise ValueError("Manifest resources are missing: " + ", ".join(missing))
    return files


def package_bytes(path: str, source: Path) -> bytes:
    data = source.read_bytes()
    if PurePosixPath(path).suffix.lower() in TEXT_SUFFIXES:
        data = data.replace(b"\r\n", b"\n")
    return data


def build(output: Path, gecko_id: str | None = None) -> Tuple[int, str]:
    manifest_path = ROOT / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Could not read manifest.json: {error}") from error
    version = manifest.get("version")
    if not isinstance(version, str) or not version:
        raise ValueError("manifest.json must define a version string")

    files = collect_files(manifest)
    if gecko_id:
        manifest['browser_specific_settings']['gecko']['id'] = gecko_id
        with tempfile.TemporaryDirectory(prefix='aurora-manifest-') as temporary:
            local_manifest = Path(temporary) / 'manifest.json'
            local_manifest.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
            files['manifest.json'] = local_manifest
            return write_archive(output, files)
    return write_archive(output, files)


def write_archive(output: Path, files: dict[str, Path]) -> Tuple[int, str]:
    """Write an atomic, reproducible archive and return its file count and hash."""
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.resolve() in (source.resolve() for source in files.values()):
        raise ValueError("The output path must not overwrite a package input")

    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix=".xpi-build-", suffix=".tmp", dir=output.parent, delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)

        with zipfile.ZipFile(
            temporary_path,
            mode="w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=9,
        ) as archive:
            for package_path in sorted(files, key=lambda name: name.encode("utf-8")):
                info = zipfile.ZipInfo(package_path, date_time=ZIP_TIMESTAMP)
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                info.extra = b""
                info.comment = b""
                archive.writestr(
                    info,
                    package_bytes(package_path, files[package_path]),
                    compress_type=zipfile.ZIP_DEFLATED,
                    compresslevel=9,
                )

        temporary_path.replace(output)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()

    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    return len(files), digest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        help="Output XPI path. Defaults to build/aurora-universal-<version>.xpi",
    )
    parser.add_argument('--gecko-id', help='Override the Gecko ID for a local development installation')
    args = parser.parse_args()

    try:
        manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
        version = manifest.get("version")
        if not isinstance(version, str) or not version:
            raise ValueError("manifest.json must define a version string")
        output = args.output or Path("build") / f"aurora-universal-{version}.xpi"
        if not output.is_absolute():
            output = ROOT / output
        count, digest = build(output, args.gecko_id)
    except (OSError, ValueError, RuntimeError) as error:
        print(f"XPI build failed. {error}", file=sys.stderr)
        return 1

    print(f"Created {output} with {count} files")
    print(f"SHA-256 {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
