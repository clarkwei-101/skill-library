# Skill Library — Web

A Next.js 14 (App Router, TypeScript) front end for the skill-library backend.
The landing page renders a **3D bookshelf** built with Three.js and animated
with GSAP: every skill in the catalogue is a book on a wooden shelf. Hover a
book to pull it out, click it to focus the camera and open a detail panel with
a download button. If WebGL is unavailable the page falls back to a flat 2D
grid with the same interactions.

## Stack

| Concern    | Choice                                        |
| ---------- | --------------------------------------------- |
| Framework  | Next.js 14 (App Router) + TypeScript          |
| 3D         | `three` 0.169                                 |
| Animation  | `gsap` 3.12                                   |
| Runtime    | Node 20 (Alpine in Docker)                    |

## Pages

| Route     | What it does                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------- |
| `/`       | Full-screen 3D bookshelf hero. Loads `GET /api/skills`, renders N books, hover pull-out + tooltip, click → camera focus + detail panel. Falls back to a 2D grid without WebGL. |
| `/upload` | Drag-and-drop or file picker for PDF / EPUB / DOCX / TXT plus a title field. `POST /api/convert/upload`, then polls `GET /api/convert/{taskId}` with a progress bar until the download link is ready. |
| `/search` | Search box backed by `GET /api/zlib/search?q=`. Lists mirror links and the API's guidance document, plus the zlib cookie/session status. |

## Components

| Component          | Responsibility                                                                  |
| ------------------ | ------------------------------------------------------------------------------- |
| `BookshelfScene`   | Owns the Three.js scene, lighting, shelf carcass, raycasting and every GSAP tween. |
| `BookMesh`         | Builds one book: a `BoxGeometry` with a hashed spine colour and a canvas title texture, plus an inset page block. |
| `DetailPanel`      | Slide-in side panel with description, metadata, chapters and the Download Skill button. |
| `UploadForm`       | File + title form, upload progress, task polling and the resulting download link. |
| `ZlibSearch`       | Query input, mirror link list, guidance steps and cookie status. |

## Proxy routes

The browser never talks to the backend directly — Next.js server routes proxy
everything, which keeps CORS out of the picture and lets the containerised web
service reach the API over the compose network.

| Web route                              | Backend route                        |
| -------------------------------------- | ------------------------------------ |
| `GET /api/skills`                      | `GET /api/skills`                    |
| `GET /api/skills/{slug}/download`      | `GET /api/skills/{slug}/download` (streams the zip) |
| `POST /api/convert/upload`             | `POST /api/convert/upload?title=…`   |
| `GET /api/convert/{taskId}`            | `GET /api/convert/{taskId}`          |
| `GET /api/zlib/search?q=`              | `GET /api/zlib/search?q=`            |
| `GET /api/zlib/cookie`                 | derived from the search endpoint     |

## Configuration

| Variable              | Default                 | Purpose                                            |
| --------------------- | ----------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | API base URL exposed to the browser.               |
| `API_INTERNAL_URL`   | —                       | Optional in-cluster address used by the server routes (set to `http://api:8000` in Docker). |

Copy `.env.example` to `.env.local` to override them.

## Run locally

```bash
cd skill-library-web
npm install
npm run dev          # http://localhost:3000
```

The backend must be reachable at `NEXT_PUBLIC_API_URL`. Without it the hero
shows an error banner explaining that the API is unreachable.

Other scripts:

```bash
npm run build        # production build
npm start            # serve the production build
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
```

## Run with Docker

From `/tmp/skill-library`:

```bash
docker compose up --build
```

- Web: <http://localhost:3000>
- API: <http://localhost:8000> (docs at <http://localhost:8000/docs>)

The `api` service mounts `./storage` at `/storage`, so skills, generated zips,
uploaded books and `tasks.json` persist on the host.

## How the bookshelf is built

- **Book count** — one book per entry returned by `GET /api/skills`; the count
  is shown in the hero copy.
- **Spine colour** — an FNV-1a hash of the skill slug picks a colour from a
  15-entry palette, with a small deterministic jitter so the shelf is not flat.
- **Title texture** — the title is drawn onto a 256×512 canvas with wrapped
  serif text, gold bands and a cloth-binding sheen, then applied to the spine
  face of the box.
- **Hover** — GSAP tweens the book toward the camera (`z + 0.62`) with
  `back.out(2.4)`, and a tooltip follows the cursor.
- **Click** — GSAP tweens the camera position and look-at target to the book,
  while the detail panel slides in.
- **Layout** — books are distributed into rows of at most 12, scaled so the
  widest row fills the frame while every spine stays narrower than a third of
  its own height. The camera distance is derived from the shelf's dimensions so
  a handful of books frames as tightly as a full row.
