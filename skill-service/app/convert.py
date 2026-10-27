"""Book -> skill conversion.

The MVP extracts plain text from the uploaded file (pdf / epub / docx / txt),
splits it into chapters heuristically, and writes a minimal but valid skill
folder (``SKILL.md`` + ``chapters/ch01.md`` ...) which is then zipped.

The conversion runs synchronously inside the request handler, but it is
bookkeeping-compatible with a background task: a task entry is created up
front, updated as the work progresses, and persisted to ``tasks.json``.
"""

from __future__ import annotations

import re
import shutil
import zipfile
from pathlib import Path
from typing import Any

from . import config, tasks

SUPPORTED_SUFFIXES = {".pdf", ".epub", ".docx", ".txt"}

# Rough word budget per generated chapter file.
CHAPTER_CHARS = 6000

_HEADING_RE = re.compile(
    r"^\s{0,3}(?:#{1,4}\s+|第[零一二三四五六七八九十百千0-9]+[章节回卷篇部]|"
    r"Chapter\s+\d+|CHAPTER\s+\d+|\d+\.\s+\S)",
    re.MULTILINE,
)


# --------------------------------------------------------------------------
# text extraction
# --------------------------------------------------------------------------
def _extract_pdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages: list[str] = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001 - a broken page must not kill the job
            pages.append("")
    return "\n\n".join(pages)


def _extract_epub(path: Path) -> str:
    import ebooklib
    from ebooklib import epub

    book = epub.read_epub(str(path))
    chunks: list[str] = []
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(item.get_content(), "html.parser")
            text = soup.get_text("\n")
        except Exception:  # noqa: BLE001
            text = ""
        text = text.strip()
        if text:
            chunks.append(text)
    return "\n\n".join(chunks)


def _extract_docx(path: Path) -> str:
    import zipfile as _zip

    from bs4 import BeautifulSoup

    with _zip.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
    soup = BeautifulSoup(xml, "xml")
    paragraphs = [p.get_text() for p in soup.find_all("w:p")]
    return "\n".join(paragraphs).strip()


def _extract_txt(path: Path) -> str:
    for encoding in ("utf-8", "utf-8-sig", "gb18030", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except (UnicodeDecodeError, LookupError):
            continue
    return path.read_text(encoding="utf-8", errors="replace")


def extract_text(path: Path) -> str:
    """Dispatch on the file suffix and return the extracted plain text."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _extract_pdf(path)
    if suffix == ".epub":
        return _extract_epub(path)
    if suffix == ".docx":
        return _extract_docx(path)
    if suffix == ".txt":
        return _extract_txt(path)
    raise ValueError(f"unsupported file type: {suffix}")


# --------------------------------------------------------------------------
# chapter splitting
# --------------------------------------------------------------------------
def split_chapters(text: str) -> list[dict[str, str]]:
    """Split text into chapters on heading-like boundaries."""
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)

    matches = list(_HEADING_RE.finditer(cleaned))
    if not matches:
        body = cleaned.strip()
        if not body:
            return []
        chunks = [
            body[i : i + CHAPTER_CHARS] for i in range(0, len(body), CHAPTER_CHARS)
        ]
        return [
            {"title": f"第{i + 1}节", "content": chunk.strip()}
            for i, chunk in enumerate(chunks)
            if chunk.strip()
        ]

    chapters: list[dict[str, str]] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(cleaned)
        title = cleaned[start : cleaned.find("\n", start) if "\n" in cleaned[start:end] else end]
        title = title.strip().lstrip("#").strip()
        content = cleaned[start:end].strip()
        if content:
            chapters.append({"title": title or f"第{index + 1}章", "content": content})

    if not chapters:
        body = cleaned.strip()
        if body:
            chapters.append({"title": "正文", "content": body})
    return chapters


# --------------------------------------------------------------------------
# skill generation
# --------------------------------------------------------------------------
def _safe_slug(title: str, fallback: str) -> str:
    slug = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]+", "-", title).strip("-").lower()
    slug = re.sub(r"-{2,}", "-", slug)
    return slug[:60] or fallback


def _describe(text: str) -> str:
    snippet = re.sub(r"\s+", " ", text).strip()
    return snippet[:160] + ("…" if len(snippet) > 160 else "")


def build_skill_folder(
    target_dir: Path,
    slug: str,
    title: str,
    chapters: list[dict[str, str]],
    source_text: str,
) -> None:
    """Write a minimal skill folder: SKILL.md + chapters/chNN.md."""
    target_dir.mkdir(parents=True, exist_ok=True)
    chapters_dir = target_dir / "chapters"
    chapters_dir.mkdir(parents=True, exist_ok=True)

    description = (
        f"知识库，源自《{title}》。涵盖 {len(chapters)} 个章节，"
        f"适合在需要引用该书方法论、框架或案例时检索使用。"
    )

    index_lines = [
        f"- **ch{idx:02d}** — {chapter['title']}"
        for idx, chapter in enumerate(chapters, start=1)
    ]

    index_text = "\n".join(index_lines) if index_lines else "- （未检测到章节标题）"
    overview = _describe(source_text)

    skill_md = f"""---
name: {slug}
description: "{description}"
---

# {title}

## How to Use This Skill

- **不带参数** — 载入核心框架速览
- **带主题** — 说明你想问的主题，我会检索并读取对应章节
- **带章节** — 说「ch01」，我加载该章
- **浏览** — 问「有哪些章节」查看完整索引

## 章节索引

{index_text}

## 概览

{overview}
"""

    (target_dir / "SKILL.md").write_text(skill_md, encoding="utf-8")

    for idx, chapter in enumerate(chapters, start=1):
        body = chapter["content"]
        # Split oversized chapters so no single file gets unwieldy.
        for part, offset in enumerate(
            range(0, len(body), CHAPTER_CHARS), start=1
        ):
            chunk = body[offset : offset + CHAPTER_CHARS].strip()
            if not chunk:
                continue
            suffix = "" if part == 1 else f"-part{part}"
            name = f"ch{idx:02d}{suffix}.md"
            content = f"# {chapter['title']}\n\n{chunk}\n"
            (chapters_dir / name).write_text(content, encoding="utf-8")


def zip_folder(source_dir: Path, target: Path) -> Path:
    """Zip ``source_dir`` into ``target`` preserving the top-level folder."""
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        target.unlink()
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source_dir.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(source_dir.parent))
    return target


def run_conversion(
    task_id: str,
    source_path: Path,
    original_name: str,
) -> dict[str, Any]:
    """Execute the conversion for ``task_id`` and return the task record."""
    tasks.update_task(
        task_id, status=tasks.TASK_RUNNING, progress=0.1, message="extracting text"
    )

    text = extract_text(source_path)
    tasks.update_task(
        task_id,
        progress=0.4,
        message="extracted text",
        result={"characters": len(text)},
    )

    chapters = split_chapters(text)
    tasks.update_task(
        task_id, progress=0.6, message=f"split into {len(chapters)} chapters"
    )

    title = Path(original_name).stem.strip() or "未命名书籍"
    slug = _safe_slug(title, "book-skill")

    # Avoid clobbering an existing skill of the same name.
    unique_slug = slug
    counter = 2
    while (config.SKILLS_DIR / unique_slug).exists():
        unique_slug = f"{slug}-{counter}"
        counter += 1

    skill_dir = config.SKILLS_DIR / unique_slug
    build_skill_folder(skill_dir, unique_slug, title, chapters, text)
    tasks.update_task(task_id, progress=0.85, message="skill folder written")

    zip_path = config.ZIPS_DIR / f"{unique_slug}.zip"
    zip_folder(skill_dir, zip_path)
    tasks.update_task(task_id, progress=0.95, message="package written")

    result = {
        "slug": unique_slug,
        "title": title,
        "chapterCount": len(chapters),
        "characters": len(text),
        "skillPath": str(skill_dir),
        "zipPath": str(zip_path),
        "zipName": zip_path.name,
        "downloadUrl": f"/api/skills/{unique_slug}/download",
        "chapters": [
            {"index": idx, "title": chapter["title"]}
            for idx, chapter in enumerate(chapters, start=1)
        ],
    }

    tasks.update_task(
        task_id,
        status=tasks.TASK_SUCCEEDED,
        progress=1.0,
        message="done",
        result=result,
    )
    return result


def remove_upload(source_path: Path) -> None:
    shutil.rmtree(source_path, ignore_errors=True)
    try:
        source_path.unlink(missing_ok=True)
    except OSError:
        pass
