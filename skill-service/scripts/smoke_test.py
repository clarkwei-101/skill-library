"""End-to-end smoke test for the skill-service using FastAPI's TestClient.

Run with:  python3 scripts/smoke_test.py

The test runs against an isolated copy of the storage tree so it never
pollutes the real library.  Pass ``--live`` to exercise the real storage
directory instead (which will create generated skills under storage/skills).
"""

from __future__ import annotations

import io
import json
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = SERVICE_DIR.parent
REAL_STORAGE = PROJECT_DIR / "storage"

sys.path.insert(0, str(SERVICE_DIR))

LIVE = "--live" in sys.argv

if LIVE:
    os.environ["SKILL_STORAGE_DIR"] = str(REAL_STORAGE)
    STORAGE_DIR = REAL_STORAGE
else:
    # Isolated sandbox: copy the real storage so the seeded skill and its
    # prebuilt zip are present, but generated output lands in a temp dir.
    STORAGE_DIR = Path(tempfile.mkdtemp(prefix="skill-service-test-"))
    shutil.copytree(REAL_STORAGE, STORAGE_DIR / "storage", dirs_exist_ok=True)
    os.environ["SKILL_STORAGE_DIR"] = str(STORAGE_DIR / "storage")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PASSED = 0
FAILED = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"  PASS  {name}")
    else:
        FAILED += 1
        print(f"  FAIL  {name}  {detail}")


def make_txt_book() -> bytes:
    parts = []
    for i in range(1, 6):
        parts.append(f"第{i}章 章节标题{i}\n")
        parts.append(("这是第 %d 章的正文内容。" % i) * 200)
        parts.append("\n")
    return "\n".join(parts).encode("utf-8")


def make_docx() -> bytes:
    """Build a minimal valid .docx in memory."""
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>"
        + "".join(
            f"<w:p><w:r><w:t>第{i}章 标题{i}</w:t></w:r></w:p>"
            f"<w:p><w:r><w:t>{'正文内容。' * 50}</w:t></w:r></w:p>"
            for i in range(1, 4)
        )
        + "</w:body></w:document>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        "</Relationships>"
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def main() -> int:
    client = TestClient(app)

    print("\n[1] GET /health")
    response = client.get("/health")
    check("status 200", response.status_code == 200, response.text[:200])
    body = response.json()
    check("status ok", body.get("status") == "ok", str(body))

    print("\n[2] GET /api/skills")
    response = client.get("/api/skills")
    check("status 200", response.status_code == 200, response.text[:200])
    body = response.json()
    check("total >= 1", body.get("total", 0) >= 1, str(body)[:200])
    first = body["skills"][0]
    check("has slug", "slug" in first)
    check("has name", bool(first.get("name")), str(first))
    check("has description", bool(first.get("description")), str(first)[:120])

    # The seeded library skill must be present and correctly parsed.
    seeded = next(
        (
            entry
            for entry in body["skills"]
            if entry["slug"] == "xiaohongshu-bao-kuan-guilv"
        ),
        None,
    )
    check("seeded skill present", seeded is not None, str(body)[:300])
    if seeded is not None:
        check(
            "seeded frontmatter name",
            seeded["name"] == "xiaohongshu-bao-kuan-guilv",
            seeded["name"],
        )
        check(
            "seeded description parsed",
            "小红书爆款规律" in seeded["description"],
            seeded["description"][:80],
        )
        check("seeded hasZip", seeded["hasZip"] is True)
        check("seeded chapterCount >= 8", seeded["chapterCount"] >= 8, str(seeded["chapterCount"]))
        first = seeded

    print("\n[3] GET /api/skills/{slug}")
    response = client.get(f"/api/skills/{first['slug']}")
    check("status 200", response.status_code == 200, response.text[:200])
    check("chapterCount > 0", response.json().get("chapterCount", 0) > 0)

    print("\n[4] GET /api/skills/{slug}/download")
    response = client.get(f"/api/skills/{first['slug']}/download")
    check("status 200", response.status_code == 200, response.text[:200])
    check("content-type zip", response.headers.get("content-type") == "application/zip")
    check(
        "content-disposition",
        "attachment" in response.headers.get("content-disposition", ""),
    )
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = archive.namelist()
    check("zip has SKILL.md", any(n.endswith("SKILL.md") for n in names), str(names[:5]))
    check("zip has chapters", any("/chapters/" in n for n in names), str(names[:5]))
    check("zip integrity", archive.testzip() is None)

    print("\n[5] GET /api/skills/{slug}/download (on-the-fly zip)")
    response = client.get("/api/skills/nonexistent-skill-xyz/download")
    check("unknown slug -> 404", response.status_code == 404, response.text[:200])

    print("\n[6] GET /api/zlib/search?q=...")
    response = client.get("/api/zlib/search", params={"q": "深入理解计算机系统"})
    check("status 200", response.status_code == 200, response.text[:200])
    body = response.json()
    check("scraped is False", body.get("scraped") is False)
    check("has guidance", isinstance(body.get("guidance"), dict))
    check("guidance has steps", len(body["guidance"].get("steps", [])) > 0)
    check("has links", len(body.get("links", [])) > 0)
    check(
        "links contain query",
        any("%E6%B7%B1" in link["url"] or "深入" in link["url"] for link in body["links"]),
        str(body["links"][:1]),
    )
    check("cookieConfigured is bool", isinstance(body.get("cookieConfigured"), bool))

    print("\n[7] GET /api/zlib/search (empty q)")
    response = client.get("/api/zlib/search")
    check("status 200", response.status_code == 200)
    check("status empty", response.json().get("status") == "empty")

    print("\n[8] POST /api/convert/upload (.txt)")
    response = client.post(
        "/api/convert/upload",
        files={"file": ("测试书籍.txt", make_txt_book(), "text/plain")},
    )
    check("status 200", response.status_code == 200, response.text[:400])
    task = response.json()
    check("has taskId", bool(task.get("taskId")), str(task)[:200])
    check("status succeeded", task.get("status") == "succeeded", str(task)[:300])
    result = task.get("result") or {}
    check("result has slug", bool(result.get("slug")), str(result)[:200])
    check("result has chapters", result.get("chapterCount", 0) > 0, str(result)[:200])
    check("result has zipName", bool(result.get("zipName")), str(result)[:200])
    new_slug = result.get("slug")

    print("\n[9] GET /api/convert/{taskId}")
    response = client.get(f"/api/convert/{task['taskId']}")
    check("status 200", response.status_code == 200)
    check("same taskId", response.json().get("taskId") == task["taskId"])
    check("progress 1.0", response.json().get("progress") == 1.0)

    print("\n[10] GET /api/convert/{unknown}")
    response = client.get("/api/convert/does-not-exist")
    check("unknown task -> 404", response.status_code == 404)

    print("\n[11] New skill is downloadable")
    if new_slug:
        response = client.get(f"/api/skills/{new_slug}/download")
        check("status 200", response.status_code == 200, response.text[:200])
        archive = zipfile.ZipFile(io.BytesIO(response.content))
        names = archive.namelist()
        check("zip has SKILL.md", any(n.endswith("SKILL.md") for n in names), str(names[:5]))
        check("zip has ch01.md", any(n.endswith("ch01.md") for n in names), str(names[:8]))

    print("\n[12] POST /api/convert/upload (.docx)")
    response = client.post(
        "/api/convert/upload",
        files={
            "file": (
                "docx-book.docx",
                make_docx(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    check("status 200", response.status_code == 200, response.text[:400])
    docx_task = response.json()
    check("status succeeded", docx_task.get("status") == "succeeded", str(docx_task)[:300])
    check("chapters detected", (docx_task.get("result") or {}).get("chapterCount", 0) > 0)

    print("\n[13] POST /api/convert/upload (unsupported type)")
    response = client.post(
        "/api/convert/upload", files={"file": ("bad.exe", b"MZ\x90\x00", "application/octet-stream")}
    )
    check("status 400", response.status_code == 400, response.text[:200])

    print("\n[14] GET /api/tasks")
    response = client.get("/api/tasks")
    check("status 200", response.status_code == 200)
    check("total >= 2", response.json().get("total", 0) >= 2)

    print("\n[15] storage/tasks.json persisted")
    tasks_file = Path(os.environ["SKILL_STORAGE_DIR"]) / "tasks.json"
    check("tasks.json exists", tasks_file.is_file(), str(tasks_file))
    if tasks_file.is_file():
        data = json.loads(tasks_file.read_text(encoding="utf-8"))
        check("tasks.json has tasks", len(data.get("tasks", {})) >= 2)

    print("\n[16] books saved to storage/books/")
    books_dir = Path(os.environ["SKILL_STORAGE_DIR"]) / "books"
    check("books dir exists", books_dir.is_dir(), str(books_dir))
    check("uploads written", len(list(books_dir.glob("*"))) >= 1)

    print(f"\n{'=' * 46}\nPASSED: {PASSED}   FAILED: {FAILED}\n{'=' * 46}")

    if not LIVE:
        shutil.rmtree(STORAGE_DIR, ignore_errors=True)
        print("(sandbox storage removed)")

    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
