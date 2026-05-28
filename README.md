# Manga Stories — Supabase-free FastAPI migration

This package removes Supabase from the uploaded React frontend and replaces it with an in-house FastAPI backend using SQLite tables.

## What changed

- Frontend no longer imports `../lib/supabase`.
- Auth now uses `/api/auth/signup`, `/api/auth/signin`, and `/api/auth/me`.
- Story CRUD, panels, read progress, documents, and manga generation are now REST API calls through `frontend/src/lib/api.ts`.
- Backend stores data in SQLite using simple SQL tables from `backend/schema.sql`.
- Uploaded files are saved locally in `backend/uploads` and served through `/uploads/...`.
- The old Supabase Edge Function call `/functions/v1/generate-manga` is replaced by `POST /api/stories/{story_id}/generate-manga`.

## Project structure

```text
manga_project_migrated/
  backend/
    app/
      main.py
      db.py
      schemas.py
      security.py
    schema.sql
    requirements.txt
    uploads/
  frontend/
    src/
      components/
      lib/
        api.ts
        auth.tsx
        types.ts
```

## Run the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set OPENAI_API_KEY before using AI generation.
uvicorn app.main:app --reload --port 8000
```

The SQLite database is created automatically at `backend/manga.db`.

## Run the frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

## First login

Register once as an admin from the UI. The frontend still lets a registering user choose `Reader` or `Admin`, matching your uploaded UI.

## Manga generation

`POST /api/stories/{story_id}/generate-manga` uses OpenAI for both the structured story script and panel images. It first asks OpenAI for a multi-panel story script, then generates one manga/comic-style image for each returned panel. The backend enforces a minimum of 5 panels through `MANGA_PANEL_COUNT`; values below 5 are raised to 5. The generated images are stored in `backend/uploads/{story_id}` and served through `/uploads/...`, so the existing manga reader can display them without a separate asset service.

Configure the backend with:

```bash
OPENAI_API_KEY=your-openai-api-key
OPENAI_TEXT_MODEL=gpt-4o-mini
OPENAI_IMAGE_MODEL=gpt-image-1-mini
OPENAI_IMAGE_SIZE=1024x1536
OPENAI_IMAGE_QUALITY=low
OPENAI_IMAGE_OUTPUT_FORMAT=png
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=marin
OPENAI_TTS_RESPONSE_FORMAT=mp3
OPENAI_TTS_SPEED=1.0
OPENAI_TTS_INSTRUCTIONS=Narrate as a clear, warm manga storyteller.

# Generates this many story panels. Values below 5 are raised to 5.
MANGA_PANEL_COUNT=5
MANGA_IMAGE_ASPECT_RATIO=3:4
```
