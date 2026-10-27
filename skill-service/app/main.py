"""Skill Service — FastAPI application.

Endpoints
---------
GET  /api/skills                     list the skill catalog
GET  /api/skills/{slug}              a single skill entry
GET  /api/skills/{slug}/download     download the skill package (zip)
POST /api/convert/upload             upload a book and convert it to a skill
GET  /api/convert/{taskId}           poll a conversion task
GET  /api/zlib/search?q=             z-library search guidance + links
GET  /api/tasks                      list conversion tasks
GET  /health                         health check
"""

from __future__ import annotations

import shutil
import unicodedata
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from . import config, convert, skills, tasks, zlib

app = FastAPI(
    title=config.API_TITLE,
    version=config.API_VERSION,
    description="Skill library API: browse, download, and generate skill packages.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    config.ensure_dirs()
    config.seed_storage()
    tasks.load_tasks()


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def _safe_filename(name: str | None) -> str:
    """Sanitize an uploaded filename so it can be written to disk safely."""
    raw = Path(name or "upload.bin").name
    raw = unicodedata.normalize("NFKC", raw)
    cleaned = "".join(ch for ch in raw if ch.isalnum() or ch in "._- ()[]")
    cleaned = cleaned.strip(". ") or "upload.bin"
    return cleaned[:120]


def _content_disposition(filename: str) -> str:
    """Build a latin-1 safe ``Content-Disposition`` header.

    Non-ASCII filenames are sent via the RFC 5987 ``filename*`` parameter so
    browsers keep the original name while the header itself stays encodable.
    """
    ascii_fallback = filename.encode("ascii", "replace").decode("ascii")
    ascii_fallback = ascii_fallback.replace('"', "'")
    encoded = quote(filename, safe="")
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"


def _unique_path(directory: Path, filename: str) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    stem = Path(filename).stem or "upload"
    suffix = Path(filename).suffix.lower()
    candidate = directory / f"{stem}{suffix}"
    counter = 1
    while candidate.exists():
        candidate = directory / f"{stem}-{counter}{suffix}"
        counter += 1
    return candidate


# --------------------------------------------------------------------------
# skill catalog
# --------------------------------------------------------------------------
@app.get("/api/skills")
def list_skills() -> dict[str, Any]:
    """List every skill available in the library."""
    entries = skills.list_skills()
    return {
        "total": len(entries),
        "skills": entries,
    }


@app.get("/api/skills/{slug}")
def get_skill(slug: str) -> dict[str, Any]:
    """Return one skill entry."""
    entry = skills.read_skill(slug)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"skill not found: {slug}")
    return entry


@app.api_route("/api/skills/{slug}/download", methods=["GET", "HEAD"])
def download_skill(slug: str) -> Response:
    """Download a skill as a zip archive."""
    try:
        payload, filename, temporary = skills.read_zip_bytes(slug)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    headers = {
        "Content-Disposition": _content_disposition(filename),
        "Content-Length": str(len(payload)),
        "X-Skill-Slug": quote(slug, safe=""),
    }
    if temporary:
        headers["X-Package"] = "generated-on-demand"
    else:
        headers["X-Package"] = "stored"

    return Response(content=payload, media_type="application/zip", headers=headers)


@app.api_route("/api/skills/{slug}/download/file", methods=["GET", "HEAD"])
def download_skill_file(slug: str) -> FileResponse:
    """Streaming variant of the download endpoint."""
    stored = config.ZIPS_DIR / f"{slug}.zip"
    if stored.is_file():
        return FileResponse(
            stored,
            media_type="application/zip",
            filename=f"{slug}.zip",
        )
    try:
        path, _temporary = skills._resolve_zip(slug)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(path, media_type="application/zip", filename=path.name)


# --------------------------------------------------------------------------
# conversion
# --------------------------------------------------------------------------
@app.post("/api/convert/upload")
async def upload_and_convert(
    file: UploadFile = File(...),
    title: str | None = Query(default=None),
) -> dict[str, Any]:
    """Upload a book and convert it into a skill package.

    The MVP performs the conversion synchronously but still records a task
    entry so the polling contract stays stable for a future async worker.
    """
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in convert.SUPPORTED_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"unsupported file type '{suffix}'. "
                f"Supported: {', '.join(sorted(convert.SUPPORTED_SUFFIXES))}"
            ),
        )

    config.ensure_dirs()
    filename = _safe_filename(file.filename)
    destination = _unique_path(config.BOOKS_DIR, filename)

    try:
        with destination.open("wb") as handle:
            shutil.copyfileobj(file.file, handle)
    finally:
        await file.close()

    original_name = title or file.filename or destination.name
    task = tasks.create_task(
        "convert",
        {
            "source": str(destination),
            "originalName": original_name,
            "status": tasks.TASK_PENDING,
        },
    )
    task_id = task["taskId"]

    try:
        convert.run_conversion(task_id, destination, original_name)
    except Exception as exc:  # noqa: BLE001 - report failures through the task
        tasks.update_task(
            task_id,
            status=tasks.TASK_FAILED,
            message="conversion failed",
            error=f"{type(exc).__name__}: {exc}",
        )

    return tasks.get_task(task_id) or {}


@app.get("/api/convert/{task_id}")
def get_convert_task(task_id: str) -> dict[str, Any]:
    """Return the state of a conversion task."""
    task = tasks.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"task not found: {task_id}")
    return task


@app.get("/api/tasks")
def list_convert_tasks() -> dict[str, Any]:
    """List all conversion tasks, newest first."""
    entries = sorted(
        tasks.list_tasks(), key=lambda item: item.get("createdAt", ""), reverse=True
    )
    return {"total": len(entries), "tasks": entries}


# --------------------------------------------------------------------------
# z-library search
# --------------------------------------------------------------------------
@app.get("/api/zlib/search")
def zlib_search(q: str = Query(default="", description="book title or author")) -> dict[str, Any]:
    """Return search guidance and ready-to-open z-library search links.

    The service does not scrape z-library.
    """
    return zlib.search(q)


# --------------------------------------------------------------------------
# misc
# --------------------------------------------------------------------------
@app.get("/health")
def health() -> dict[str, Any]:
    """Health check used by Docker and the orchestrator."""
    return {
        "status": "ok",
        "service": config.API_TITLE,
        "version": config.API_VERSION,
        "storage": str(config.STORAGE_DIR),
        "skills": len(skills.list_skills()),
    }


@app.get("/")
def root() -> JSONResponse:
    """A tiny index of the available endpoints."""
    return JSONResponse(
        {
            "service": config.API_TITLE,
            "version": config.API_VERSION,
            "endpoints": [
                "GET  /api/skills",
                "GET  /api/skills/{slug}",
                "GET  /api/skills/{slug}/download",
                "POST /api/convert/upload",
                "GET  /api/convert/{taskId}",
                "GET  /api/tasks",
                "GET  /api/zlib/search?q=",
                "GET  /health",
            ],
        }
    )
