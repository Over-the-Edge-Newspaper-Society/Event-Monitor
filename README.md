# Instagram Event Monitor

End-to-end prototype for continuously scraping Instagram club accounts, classifying posters, and managing event extraction ready for EventScrape integration.

## Features
- **Free Instagram scraping** via Instaloader (no API keys needed for public profiles).
- **SQLite persistence** for clubs, posts, and extracted events.
- **Per-club classification mode** (`auto` or `manual`) with adjustable active status.
- **Background monitoring loop** that polls active clubs on a schedule.
- **REST API** (FastAPI) for monitor control, classification queue, and event storage.
- **React dashboard** (Vite + Tailwind) mirroring the architecture mock-ups for CSV import, monitoring controls, manual review, and event JSON management.
- **Gemini-powered extraction** that turns approved posters into structured event JSON with a single click once an API key is configured.

## Repository Layout
```
backend/
  app/
    database.py         # SQLAlchemy engine/session setup
    main.py             # FastAPI app + REST endpoints
    models.py           # ORM models and default settings helper
    services/
      classifier.py     # Keyword/NB caption classifier for auto mode
      monitor.py        # Instaloader-based polling service
    utils/
      csv_loader.py     # CSV import helper (supports manual/auto flags)
    scripts/
      import_clubs.py   # CLI to import clubs from CSV
  requirements.txt
frontend/
  package.json          # React/Vite/Tailwind dashboard
  src/App.tsx           # UI implementation
  ...
```

## Backend Setup
1. Create a virtual environment and install dependencies:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Import your clubs CSV (supports the provided export path):
   ```bash
   python -m backend.app.scripts.import_clubs \
     "/Users/ahzs645/Downloads/Instagram/clubs_instagram_2025-09-17 (2).csv"
   ```
3. Run the API:
   ```bash
   uvicorn backend.app.main:app --reload
   ```
   The service listens on `http://localhost:8000` by default.

### Apify Node Runner (recommended)
If you rely on Apify for scraping, install the bundled Node.js helper that calls Actors via the official `apify-client` library. It delivers better reliability than the bare REST fallback.

1. Ensure Node.js 18 or newer is available on the host.
2. Install the runner dependencies once:
   ```bash
   cd backend/app/utils/apify_node_runner
   npm install
   ```
3. Start the backend with the environment variable `APIFY_USE_NODE_CLIENT=1` (or leave it unset—the runner is picked automatically when the dependencies are present). Optional environment knobs:
   - `APIFY_NODE_COMMAND` – override the Node binary (`node` by default).
   - `APIFY_NODE_RUNNER_PATH` – point to a custom runner script.
   - `APIFY_NODE_TIMEOUT_BUFFER_SECONDS` – extra seconds to allow the runner to flush output after an actor finishes (default `30`).

If the runner or Node is missing, the backend transparently falls back to the existing REST polling client.

### Key API Endpoints
- `POST /monitor/start` / `POST /monitor/stop` – toggle background scraping.
- `GET /monitor/status` – check last/next run times.
- `GET /clubs` & `PATCH /clubs/{id}` – manage club activation and classification mode.
- `POST /clubs/import` – upload CSV via UI.
- `GET /posts?status=pending|events|non_events` – queue management.
- `POST /posts/{id}/classify` – manual override.
- `POST /posts/{id}/extract` – invoke Gemini to parse the poster image (requires API key).
- `POST /posts/{id}/events` – persist manual edits or reviewed Gemini JSON and mark processed.
- `GET /stats` – quick dashboard metrics.

The monitoring loop respects the `monitoring_enabled` flag (default `false`). Auto-classification uses the keyword classifier; drop a `event_classifier.pkl` beside `backend/app/services/classifier.py` to use a custom scikit-learn model instead.

### Gemini Event Extraction
- Provide a Gemini API key through the dashboard (Setup → Gemini card) or set the `GEMINI_API_KEY` environment variable before starting the backend. A stored key is never exposed via the API responses—only its presence is reported.
- Optionally override the model with `GEMINI_MODEL_ID` (defaults to `gemini-2.5-flash`).
- The Events tab exposes an “Extract with Gemini” button that calls `POST /posts/{id}/extract` and automatically stores the structured JSON payload under the matching post.
- You can re-run extraction at any time; existing JSON is overwritten unless `overwrite=false` is supplied on the endpoint.

## Frontend Setup
1. Install dependencies and start the Vite dev server:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Visit `http://localhost:5173` and ensure `VITE_API_BASE` (optional) points to the FastAPI host. Without configuration, it defaults to `http://localhost:8000`.

### Dashboard Highlights
- **Setup tab** – upload CSV, toggle clubs on/off, flip auto/manual classification per club.
- **Monitor tab** – start/stop the scraper, view interval, last run, and stats snapshot.
- **Classify tab** – review pending posts, apply manual decisions, attach event JSON to AI-detected posts.
- **Events tab** – manage confirmed event posters and edit stored JSON payloads.

## Docker Deployment
Spin up the React dashboard and FastAPI backend together with Docker Compose (handy for servers such as Komodo).

1. Build and start both services:
   ```bash
   docker-compose up --build
   ```
   The frontend is served on `http://localhost:3000` and proxies API calls to the backend container.
2. Access the API directly at `http://localhost:8000` if needed, or via the frontend's `/api/*` proxy.
3. Local volumes keep state between restarts:
   - `backend/instagram_monitor.db` (SQLite database)
   - `backend/app/static/images` (downloaded Instagram images)
4. To deploy on a remote host, copy the repository, adjust exposed ports in `docker-compose.yml` as required, then run `docker-compose up -d --build`.

### Instagram Login & Rate Limits
- Generate a session file on your desktop: `instaloader -l YOUR_USERNAME` (the command will create `YOUR_USERNAME.session` once you authenticate and complete 2FA).
- Open the app’s **Setup → Instagram Login** card, enter the same username, and upload the `.session` file so Instaloader uses the authenticated cookies.
- Remove or replace the session at any time from the same card; the file is stored outside the repo at `backend/instaloader_session/` (ignored by git).
- Tune the **Fetch Throttling** delay in the Setup tab to pause between club lookups. Start with 2–5 seconds if Instagram returns “Please wait a few minutes before you try again.”

## Manual Verification Checklist
- `python -m compileall backend/app` passes for all backend modules.
- FastAPI endpoints return structured data (verified via schema definitions and compilation).
- Frontend imports align with Tailwind utilities (no custom plugins required).
- Instaloader gracefully degrades if unavailable (monitor loop still runs without raising).

Run the backend first, then the frontend; use the dashboard to start monitoring once ready.
