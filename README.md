# Manga Stories Platform

Manga Stories is a application for turning story prompts and descriptions into manga-style learning stories. Admin users can create and edit stories, generate manga panels, generate narration audio, and publish stories. Reader users can browse published stories, read the panels, listen to narration, and track progress.

## Features

- Email/password authentication with `admin` and `user` roles.
- Admin dashboard for story creation, editing, filtering, publishing, unpublishing, and deletion.
- Story editor with title, description, category, context prompt, source document upload, panel editor, preview, and narration playback.
- AI manga generation using OpenAI for structured panel scripts, panel images, and text-to-speech narration.
- Reader dashboard for published story browsing, search, category filtering, completed/in-progress counts, and continue-reading state.
- SQLite persistence for profiles, stories, panels, documents, and reading progress.
- Local media storage for generated images and generated audio.

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- FastAPI
- Pydantic
- SQLite
- Python standard library `urllib` for OpenAI API calls
- Local filesystem uploads served through FastAPI `StaticFiles`

### AI Services

- OpenAI chat completions for manga panel script generation.
- OpenAI image generation for manga panel artwork.
- OpenAI audio speech for narration.

## Project Structure

```text
manga_project_migrated/
  .gitignore
  README.md
  backend/
    app/
      db.py
      generation.py
      main.py
      schemas.py
      security.py
    requirements.txt
    schema.sql
    .env              # local only, ignored by Git
    manga.db          # runtime SQLite database, ignored by Git
    uploads/          # runtime generated/uploaded media, ignored by Git
    venv/             # local virtual environment, ignored by Git
  frontend/
    index.html
    package-lock.json
    package.json
    postcss.config.js
    src/
      App.tsx
      components/
        AdminDashboard.tsx
        AuthPage.tsx
        MangaReader.tsx
        StoryEditor.tsx
        UserDashboard.tsx
      index.css
      lib/
        api.ts
        auth.tsx
        types.ts
      main.tsx
      vite-env.d.ts
    tailwind.config.js
    tsconfig.app.json
    tsconfig.json
    vite.config.ts
    node_modules/     # installed dependencies, ignored by Git
```

## Prerequisites

- Python 3.10+ recommended.
- Node.js 20.19+ or 22.12+ recommended for the installed Vite version.
- npm.
- OpenAI API key for manga and narration generation.

## Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env` and set at least:

```bash
OPENAI_API_KEY=your-openai-api-key
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Start the API server:

```bash
uvicorn app.main:app --reload --port 8000
```

The backend creates the SQLite database automatically at `backend/manga.db` unless `DATABASE_PATH` is changed.

## Frontend Setup

```bash
cd frontend
npm install
# if using a different verison of node 
nvm use 20 #or 22 

npm run dev
```

## Running The App
1. Register or sign in from the browser.
2. Admin users land on the admin console.
3. Reader users land on the reader dashboard.

## Admin Workflow

1. Create a new story with a title, description, category, and context prompt.
2. Generate manga panels from the prompt.
3. Review and edit panel titles, narrative text, image URLs, image prompts, panel types, and dialogue.
4. Generate narration audio for the panels.
5. Publish the story when it is ready for readers.

## Reader Workflow

1. Browse published stories.
2. Filter by category or search by title/description.
3. Open a story in the manga reader.
4. Navigate panels with buttons or arrow keys.
5. Play generated narration audio.
6. Reading progress is saved through the backend.

## Backend API Overview

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/signin`
- `GET /api/auth/me`

### Stories

- `GET /api/admin/stories`
- `GET /api/stories`
- `POST /api/stories`
- `PATCH /api/stories/{story_id}`
- `DELETE /api/stories/{story_id}`

### Panels And Generation

- `GET /api/stories/{story_id}/panels`
- `PUT /api/stories/{story_id}/panels`
- `POST /api/stories/{story_id}/generate-manga`
- `POST /api/stories/{story_id}/generate-narration`

### Documents

- `GET /api/stories/{story_id}/documents`
- `POST /api/stories/{story_id}/documents`
- `DELETE /api/documents/{document_id}`

### Reading Progress

- `GET /api/me/reads`
- `POST /api/stories/{story_id}/read`
- `PATCH /api/reads/{read_id}`

## Environment Variables

### Backend

You can set these variables in a backend/.env file or as separate environment variables in your account
```bash
DATABASE_PATH=./manga.db
UPLOAD_DIR=./uploads
TOKEN_TTL_SECONDS=604800
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

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
OPENAI_TTS_INSTRUCTIONS=Narrate as a clear, warm manga storyteller.Use natural pacing, expressive but professional tone, and brief pauses between ideas.

# Generates this many story panels. Values below 5 are raised to 5.
MANGA_PANEL_COUNT=5
MANGA_IMAGE_ASPECT_RATIO=3:4
```

## Runtime Data

The following are local runtime artifacts and should not be committed:

- `backend/.env`
- `backend/manga.db`
- `backend/uploads/`
- `backend/venv/` or `backend/.venv/`
- `frontend/node_modules/`
- `frontend/dist/`
- `*.tsbuildinfo`
- `__pycache__/`

These are covered by the root `.gitignore`.

## SECRET_KEY Note

The backend uses `SECRET_KEY` in `backend/app/security.py` to sign and verify the custom bearer tokens returned from signup and signin. Those tokens are used by protected API routes to identify the current user and enforce admin/user access.

Current behavior:

- If `SECRET_KEY` is set in `backend/.env`, the backend uses that value.
- If it is not set, the backend falls back to the hardcoded development value `change-this-dev-secret`.
- This fallback is convenient for local testing, but it means every app running with the default value can produce tokens that validate against every other app using the same default.

For production:

- Always set `SECRET_KEY` in the deployment environment or secret manager.
- Use a long, random value and never commit it to Git.
- Rotate it carefully because changing `SECRET_KEY` invalidates existing login tokens and users will need to sign in again.
- Do not rely on the default `change-this-dev-secret` outside local development.
