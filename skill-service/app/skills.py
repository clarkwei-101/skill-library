"""Skill catalog helpers.

A "skill" is a directory under ``storage/skills/<slug>/`` that contains a
``SKILL.md`` with YAML frontmatter (``name`` and ``description``).
"""

from __future__ import annotations

import io
import shutil
import zipfile
from pathlib import Path
from typing import Any

import yaml

from . import config

SKILL_FILE = "SKILL.md"


def _parse_frontmatter(path: Path) -> tuple[dict[str, Any], str]:
    """Return ``(frontmatter, body)`` for a SKILL.md file."""
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {}, ""

    if not raw.startswith("---"):
        return {}, raw

    parts = raw.split("---", 2)
    if len(parts) < 3:
        return {}, raw

    try:
        meta = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        meta = {}

    if not isinstance(meta, dict):
        meta = {}
    return meta, parts[2]


def read_skill(slug: str) -> dict[str, Any] | None:
    """Build a catalog entry for ``slug`` or return ``None`` if unknown."""
    skill_dir = config.SKILLS_DIR / slug
    skill_file = skill_dir / SKILL_FILE
    if not skill_file.is_file():
        return None

    meta, _body = _parse_frontmatter(skill_file)
    chapters = sorted(
        p.name
        for p in (skill_dir / "chapters").glob("*.md")
        if p.is_file()
    )
    extras = sorted(
        p.name
        for p in skill_dir.iterdir()
        if p.is_file() and p.name != SKILL_FILE
    )

    return {
        "slug": slug,
        "name": meta.get("name") or slug,
        "description": meta.get("description") or "",
        "version": meta.get("version"),
        "author": meta.get("author"),
        "tags": meta.get("tags") or [],
        "path": str(skill_dir),
        "hasZip": (config.ZIPS_DIR / f"{slug}.zip").is_file(),
        "chapters": chapters,
        "chapterCount": len(chapters),
        "extras": extras,
    }


def list_skills() -> list[dict[str, Any]]:
    """List every skill folder that ships a SKILL.md."""
    if not config.SKILLS_DIR.is_dir():
        return []

    entries: list[dict[str, Any]] = []
    for child in sorted(config.SKILLS_DIR.iterdir()):
        if not child.is_dir() or child.name.startswith((".", "_")):
            continue
        entry = read_skill(child.name)
        if entry is not None:
            entries.append(entry)
    return entries


def zip_skill_folder(slug: str, target: Path) -> Path:
    """Zip the folder ``storage/skills/<slug>`` into ``target`` on the fly."""
    source = config.SKILLS_DIR / slug
    if not source.is_dir():
        raise FileNotFoundError(f"skill folder not found: {slug}")

    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source.rglob("*")):
            if path.is_file():
                archive.write(path, Path(slug) / path.relative_to(source))
    return target


def _resolve_zip(slug: str) -> tuple[Path, bool]:
    """Return ``(zip_path, is_temporary)`` for ``slug``."""
    stored = config.ZIPS_DIR / f"{slug}.zip"
    if stored.is_file():
        return stored, False

    source = config.SKILLS_DIR / slug
    if source.is_dir():
        tmp_dir = config.ZIPS_DIR / ".tmp"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        target = tmp_dir / f"{slug}.zip"
        return zip_skill_folder(slug, target), True

    raise FileNotFoundError(f"no downloadable package for skill: {slug}")


def read_zip_bytes(slug: str) -> tuple[bytes, str, bool]:
    """Return ``(payload, filename, is_temporary)`` for the download."""
    path, temporary = _resolve_zip(slug)
    data = path.read_bytes()
    return data, path.name, temporary


def cleanup_temporary(path: Path) -> None:
    shutil.rmtree(path.parent, ignore_errors=True)
