# Skill Service

FastAPI service for browsing, downloading, and generating skill packages from
the shared storage tree.

```
skill-library/
├── storage/
│   ├── skills/          # <slug>/SKILL.md + chapters/   (source of truth)
│   ├── zips/            # <slug>.zip                   (prebuilt packages)
│   ├── books/           # uploaded source files
│   └── tasks.json       # persisted conversion tasks
└── skill-service/
    ├── app/
    │   ├── config.py    # paths + env configuration
    │   ├── main.py      # FastAPI app and routes
    │   ├── skills.py    # catalog + zip packaging
    │   ├── convert.py   # text extraction + skill generation
    │   ├── tasks.py     # in-memory task registry (persisted to JSON)
    │   └── zlib.py      # z-library guidance + search links
    ├── scripts/
    │   └── smoke_test.py
    ├── requirements.txt
    └── Dockerfile
```

## Run locally

```bash
cd skill-library/skill-service
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The service resolves `storage/` relative to the project base. Override with
`SKILL_STORAGE_DIR=/some/other/dir`.

## Run with Docker

```bash
docker build -t skill-service skill-library/skill-service
docker run --rm -p 8000:8000 \
  -v "$(pwd)/storage:/storage" \
  -e SKILL_STORAGE_DIR=/storage \
  skill-service
```

The image is `python:3.12-slim` with `poppler-utils`, exposes port `8000`, and
ships a `/health` healthcheck.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/skills` | List the catalog (reads `name`/`description` from SKILL.md frontmatter) |
| GET | `/api/skills/{slug}` | One skill entry |
| GET | `/api/skills/{slug}/download` | Download the skill zip (stored, or zipped on the fly) |
| POST | `/api/convert/upload` | Upload a `.pdf`/`.epub`/`.docx`/`.txt` book, convert it to a skill |
| GET | `/api/convert/{taskId}` | Poll a conversion task |
| GET | `/api/tasks` | List all conversion tasks |
| GET | `/api/zlib/search?q=` | Search guidance + z-library search links |
| GET | `/health` | Health check |

### Examples

```bash
curl http://127.0.0.1:8000/api/skills
curl -OJ http://127.0.0.1:8000/api/skills/xiaohongshu-bao-kuan-guilv/download
curl -F "file=@book.epub" http://127.0.0.1:8000/api/convert/upload
curl "http://127.0.0.1:8000/api/convert/<taskId>"
curl "http://127.0.0.1:8000/api/zlib/search?q=深入理解计算机系统"
```

### z-library endpoint

The MVP **does not scrape** z-library. `GET /api/zlib/search?q=...` returns a
guidance document (steps, tips, query template) plus ready-to-open search URLs
for the configured mirrors. If `ZLIB_COOKIE` is set in the environment the
response reports `cookieConfigured: true`; the cookie value itself is never
echoed back to the client and never leaves the process.

```bash
ZLIB_COOKIE=... uvicorn app.main:app --port 8000
```

### Conversion behavior

`POST /api/convert/upload` saves the file to `storage/books/`, creates a task
entry, extracts text (`pypdf` / `ebooklib` + `bs4` / `docx` via `bs4` / plain
text), splits it into chapters on heading-like boundaries, then writes a
minimal skill folder (`SKILL.md` + `chapters/ch01.md`, `ch02.md`, ...) into
`storage/skills/<slug>/` and zips it to `storage/zips/<slug>.zip`.

The MVP runs the conversion synchronously inside the request, but the task
record is created up front and persisted to `storage/tasks.json`, so the
polling contract stays stable when the work moves to a background worker.

## Tests

```bash
cd skill-library/skill-service
python3 scripts/smoke_test.py
```

49 assertions covering the catalog, downloads, z-library guidance, and
`.txt`/`.docx`/`.epub`/`.pdf` conversion.
