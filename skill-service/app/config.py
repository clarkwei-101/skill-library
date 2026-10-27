"""Runtime configuration for the skill-service.

All paths are resolved relative to the project base (the parent of
``skill-service``) so the same code works from a checkout and from the
Docker image.  ``SKILL_STORAGE_DIR`` can override the storage root.
"""

from __future__ import annotations

import os
from pathlib import Path

# .../skill-library/skill-service/app/config.py -> .../skill-library
BASE_DIR: Path = Path(__file__).resolve().parents[2]

STORAGE_DIR: Path = Path(
    os.getenv("SKILL_STORAGE_DIR", str(BASE_DIR / "storage"))
).expanduser()

SKILLS_DIR: Path = STORAGE_DIR / "skills"
ZIPS_DIR: Path = STORAGE_DIR / "zips"
BOOKS_DIR: Path = STORAGE_DIR / "books"
TASKS_FILE: Path = STORAGE_DIR / "tasks.json"

# Optional cookie for z-library.  The MVP never sends it anywhere: it is only
# recorded as "configured" so callers can tell an authenticated deployment
# apart from an anonymous one.
ZLIB_COOKIE: str = os.getenv("ZLIB_COOKIE", "").strip()

# Public base of the z-library mirrors we hand back as search links.  We do
# not scrape them, we only build URLs for the browser to open.
ZLIB_MIRRORS: tuple[str, ...] = (
    "https://z-lib.gs",
    "https://zh.z-lib.gs",
    "https://singlelogin.re",
)

API_TITLE = "Skill Service"
API_VERSION = "0.1.0"


def ensure_dirs() -> None:
    """Create the storage layout if it does not exist yet."""
    for directory in (STORAGE_DIR, SKILLS_DIR, ZIPS_DIR, BOOKS_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    if not TASKS_FILE.exists():
        TASKS_FILE.parent.mkdir(parents=True, exist_ok=True)
        TASKS_FILE.write_text(
            '{"version": 1, "tasks": {}}', encoding="utf-8"
        )
