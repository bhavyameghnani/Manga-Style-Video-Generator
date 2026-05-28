# Nomura Manga Stories Platform

## 1. Executive Summary

The Manga Stories Platform is an internal knowledge storytelling application that converts administrator-provided business context, prompts, and optional source documents into manga-style learning stories. Each story is composed of ordered panels with generated manga artwork, overlay narration text, optional character dialogue, and AI-generated audio narration.

The current implementation is a Supabase-free migration that uses:

- A React + TypeScript + Vite frontend.
- A FastAPI backend.
- SQLite for application data.
- Local filesystem storage for generated images, uploaded documents, and narration audio.
- OpenAI APIs for story script generation, image generation, and text-to-speech narration.

There are two primary personas:

- Admin: creates, edits, generates, publishes, and deletes stories.
- Reader/User: browses published stories, reads manga panels, listens to narration, and tracks reading progress.

The user's original project description is directionally correct. The main caveat is that admin registration is currently self-service: the signup UI and backend allow a registering user to choose the `admin` role. Admin permissions are enforced after authentication, but admin provisioning itself is not yet governed.

## 2. Product Context

### Problem

Large organizations often maintain important knowledge in long-form documents, training decks, policy pages, onboarding material, and product explainers. Employees may not engage deeply with that material if the format is dense or repetitive.

### Proposed Solution

Use manga-style storytelling as a knowledge delivery format:

- Convert abstract business concepts into character-led, visual narratives.
- Break complex learning content into sequential panels.
- Make compliance, training, leadership, product, finance, and culture topics more memorable.
- Add AI-generated voice narration to support passive learning and accessibility.

### Why This Matters For Nomura

For an enterprise audience such as Nomura, this can support:

- Internal training and onboarding.
- Policy awareness and compliance education.
- Product and finance explainers.
- Leadership and culture communication.
- More engaging knowledge transfer for distributed teams.

This application should be treated as an internal learning content platform, not just a manga generator.

## 3. Validated Scope

### Confirmed From Code

- Users authenticate through email and password.
- User profiles have role-based access: `admin` or `user`.
- Admins can create, update, publish, unpublish, delete, and generate stories.
- Admins can manually edit panel text, image URLs, panel type, character names, and dialogue.
- Admins can upload source documents against a story.
- Story generation creates a panel script, generates panel images, generates narration audio, and stores the resulting panel data.
- Readers only see published stories through the normal user dashboard.
- Readers can open a manga reader, move through panels, play narration, and update reading progress.
- Data is persisted in SQLite.
- Media files are persisted under `backend/uploads/{story_id}` and served through `/uploads/...`.

### Important Corrections

- The frontend exposes role choice during registration. Anyone can register as admin unless an external process or deployment change prevents it.
- Uploaded PDFs, DOCX files, and PPTX files are stored, but only text-like files (`txt`, `md`, `markdown`, `csv`, `json`) are parsed into generation context today.
- Manga generation is synchronous. A single request can call OpenAI multiple times and can take a long time.
- The app uses custom HMAC tokens, not OAuth, SSO, JWT libraries, or enterprise identity integration.
- The current project snapshot includes generated runtime data: `backend/manga.db` and `backend/uploads`.

## 4. High-Level Architecture

```text
Browser
  |
  | React UI
  | - AuthPage
  | - AdminDashboard
  | - StoryEditor
  | - UserDashboard
  | - MangaReader
  v
FastAPI Backend
  |
  | REST API
  | - /api/auth/*
  | - /api/stories/*
  | - /api/admin/stories
  | - /api/me/reads
  v
SQLite Database
  |
  | Stores profiles, stories, panels, documents, reading progress
  v
Local Upload Storage
  |
  | Stores uploaded files, generated images, generated narration audio
  v
OpenAI APIs
  |
  | Story script generation, image generation, audio narration
```

## 5. Technology Stack

### Frontend

- React for UI.
- TypeScript for static typing.
- Vite for development/build tooling.
- Tailwind CSS for styling.
- Lucide React for icons.
- Browser `localStorage` for storing the auth token.

### Backend

- FastAPI for REST APIs.
- Pydantic for request validation.
- SQLite through Python's standard `sqlite3` module.
- `python-multipart` for file uploads.
- `python-dotenv` for backend `.env` loading.
- FastAPI `StaticFiles` for serving local media.
- Python standard library `urllib` for OpenAI HTTP calls.

### AI Services

- Chat completions endpoint for structured panel script generation.
- Image generation endpoint for manga panel artwork.
- Audio speech endpoint for text-to-speech narration.

### Storage

- SQLite database file: `backend/manga.db`.
- SQL schema file: `backend/schema.sql`.
- Media directory: `backend/uploads`.

## 6. Frontend Architecture

### Entry Flow

`frontend/src/App.tsx` wraps the application in `AuthProvider`, checks `/api/auth/me` on load, then routes by role:

- No user: `AuthPage`.
- Admin profile: `AdminDashboard`.
- User profile: `UserDashboard`.

### API Client

`frontend/src/lib/api.ts` centralizes all backend communication:

- Uses `VITE_API_BASE_URL`, defaulting to `http://localhost:8000`.
- Stores token in `localStorage` under `manga_auth_token`.
- Adds `Authorization: Bearer <token>` for authenticated calls.
- Converts relative media paths like `/uploads/...` to absolute backend URLs.

### Authentication State

`frontend/src/lib/auth.tsx` provides:

- `signIn`
- `signUp`
- `signOut`
- `user`
- `profile`
- initial auth rehydration via `/api/auth/me`

### Admin Experience

`AdminDashboard.tsx` provides:

- Story listing.
- Category/status filtering.
- Publish/unpublish action.
- Delete action.
- Entry point to `StoryEditor`.

`StoryEditor.tsx` provides:

- Story detail editing.
- Context prompt editing.
- Source document upload.
- AI manga generation.
- AI narration generation.
- Manual panel add/edit/delete/reorder.
- Panel preview.
- Inline audio playback for generated narration.

### Reader Experience

`UserDashboard.tsx` provides:

- Published story catalog.
- Search by title/description.
- Category filtering.
- Continue-reading section.
- Completed/in-progress counts.

`MangaReader.tsx` provides:

- Panel-by-panel reading.
- Keyboard navigation.
- Panel list sidebar.
- Fullscreen mode.
- Progress bar.
- Reading progress persistence.
- AI narration playback.
- Fallback timed auto-advance if narration is unavailable during playback logic.

## 7. Backend Architecture

### Application Setup

`backend/app/main.py` defines the FastAPI application:

- Configures CORS from `CORS_ORIGINS`.
- Serves `/uploads` from the configured upload directory.
- Initializes the database on startup.
- Exposes authentication, story, panel, document, generation, and read-progress APIs.

### Database Layer

`backend/app/db.py` defines:

- `BASE_DIR`, `DB_PATH`, `SCHEMA_PATH`, `UPLOAD_DIR`.
- SQLite connection creation with foreign keys enabled.
- `init_db()` to create schema and ensure some migration columns exist.
- Small helper functions for one/many/execute queries.

### Security Layer

`backend/app/security.py` implements:

- Password hashing using PBKDF2-HMAC-SHA256.
- 210,000 password hash iterations.
- 16-byte random salt.
- HMAC-signed bearer tokens.
- Token expiry using `TOKEN_TTL_SECONDS`, defaulting to 7 days.

This is simple and locally understandable, but it is not enterprise-grade identity management.

### Schema Validation

`backend/app/schemas.py` defines Pydantic request models:

- Signup/signin input.
- Story creation/update input.
- Panel replacement input.
- Manga generation input.
- Read progress update input.

## 8. API Surface

### Health

- `GET /api/health`

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/signin`
- `GET /api/auth/me`

### Stories

- `GET /api/admin/stories`: admin-only story list with counts.
- `GET /api/stories`: admin sees all unless filtered; user sees published by default.
- `POST /api/stories`: admin-only create.
- `PATCH /api/stories/{story_id}`: admin-only update.
- `DELETE /api/stories/{story_id}`: admin-only delete.

### Panels

- `GET /api/stories/{story_id}/panels`: accessible to admins, story creators, or users if published.
- `PUT /api/stories/{story_id}/panels`: admin-only full replacement.

### Generation

- `POST /api/stories/{story_id}/generate-manga`: admin-only.
- `POST /api/stories/{story_id}/generate-narration`: admin-only.

### Documents

- `GET /api/stories/{story_id}/documents`
- `POST /api/stories/{story_id}/documents`: admin-only upload.
- `DELETE /api/documents/{document_id}`: admin-only delete.

### Reading Progress

- `GET /api/me/reads`
- `POST /api/stories/{story_id}/read`
- `PATCH /api/reads/{read_id}`

## 9. Data Model

### profiles

Stores users and roles:

- `id`
- `email`
- `password_hash`
- `full_name`
- `role`: `admin` or `user`
- `department`
- timestamps

### stories

Stores story metadata:

- `id`
- `title`
- `description`
- `category`
- `context_prompt`
- `cover_image_url`
- `created_by`
- `status`: `draft`, `generating`, or `published`
- `published_at`
- timestamps

### story_panels

Stores ordered manga panels:

- `id`
- `story_id`
- `panel_number`
- `title`
- `narrative_text`
- `narration_audio_url`
- `narration_duration_ms`
- `image_url`
- `image_prompt`
- `panel_type`: `cover`, `narration`, `dialogue`, `action`, `summary`
- `character_name`
- `character_dialogue`
- `created_at`

### documents

Stores uploaded source document metadata:

- `id`
- `story_id`
- `file_name`
- `file_url`
- `file_type`
- `file_size`
- `uploaded_by`
- `created_at`

### story_reads

Stores per-user reading progress:

- `id`
- `story_id`
- `user_id`
- `last_panel_read`
- `completed`
- timestamps

The schema includes foreign keys and cascade deletes for story-owned data.

## 10. Database Creation, Storage, And Maintenance

The database is created automatically at backend startup through `init_db()`.

Process:

1. Backend starts.
2. `init_db()` creates the upload directory.
3. SQLite opens `DATABASE_PATH`, defaulting to `backend/manga.db`.
4. `schema.sql` is executed with `CREATE TABLE IF NOT EXISTS`.
5. Some additive migration checks ensure narration columns exist on `story_panels`.

Current local snapshot observed:

- 2 profiles.
- 3 published stories.
- 15 story panels.
- 0 document rows.
- 3 read-progress rows.
- Upload folder size is about 68 MB.
- Database file size is about 136 KB when measured from the project root.

Maintenance implications:

- SQLite is simple and good for local development, demos, and small internal pilots.
- There is no formal migration framework.
- Backups require copying both `manga.db` and `uploads`.
- Deleting a story cascades database rows but does not currently delete that story's upload directory.
- Regenerating panels replaces database rows but old generated media files may remain on disk.

## 11. AI Generation Workflow

### Manga Generation

Admin clicks `Generate Manga Panels` in `StoryEditor`.

Flow:

1. Frontend saves story metadata.
2. Frontend calls `POST /api/stories/{story_id}/generate-manga`.
3. Backend sets story status to `generating`.
4. Backend gathers selected document context.
5. Backend calls OpenAI chat completions for a strict JSON panel script.
6. Backend normalizes the returned panels.
7. For each panel, backend calls OpenAI image generation.
8. For each panel, backend calls OpenAI audio speech.
9. Images and audio are written to `backend/uploads/{story_id}`.
10. Existing panels are deleted and replaced in SQLite.
11. First generated image becomes the story cover.
12. Story status returns to its prior status.

### Prompt Behavior

The script prompt asks OpenAI to:

- Act as a manga storyboard director.
- Create exactly `MANGA_PANEL_COUNT` panels.
- Use a structured JSON schema.
- Make panel 1 a cover/opening panel.
- Make the final panel a takeaway/resolution.
- Avoid embedded text, speech bubbles, captions, logos, and watermarks in generated images.
- Keep recurring character visuals consistent.

### Panel Count

- Minimum: 5.
- Maximum: 20.
- Default: 5.
- Values below 5 are raised to 5.

### Narration Generation

Narration uses the panel's `narrative_text` only. Character dialogue is not included in the TTS input today.

## 12. Runtime Data Flow

### Admin Creates A Story

```text
Admin UI -> POST /api/stories -> stories row created
Admin UI -> optional file upload -> documents row + local file
Admin UI -> generate manga -> panels + media assets
Admin UI -> publish -> story status published
```

### Reader Opens A Story

```text
UserDashboard -> GET /api/stories?status=published
Reader opens story -> GET panels + POST read record
Reader navigates -> PATCH read progress
Reader plays narration -> audio served from /uploads
```

## 13. Security And Access Control

### Current Controls

- Passwords are salted and hashed.
- Tokens are HMAC-signed and expire.
- Protected APIs require bearer token auth.
- Admin-only dependencies protect story mutation, generation, and document mutation endpoints.
- Non-admin users only see published stories in normal listing.
- Story access helper prevents users from opening draft stories unless they are admin or creator.

### Security Gaps For Enterprise Use

- Self-service admin registration is allowed.
- No SSO, SAML, OIDC, or corporate identity provider integration.
- No MFA.
- `SECRET_KEY` defaults to `change-this-dev-secret` if not configured.
- Token is stored in `localStorage`, which is exposed to XSS.
- No CSRF model is needed for bearer tokens, but XSS protection becomes more important.
- No rate limiting.
- No audit logging for story creation, generation, publish, delete, or admin actions.
- No content moderation or approval workflow.
- Uploaded files are not virus-scanned.
- Uploaded files have limited filename sanitization but no content validation.
- Local `/uploads` files are served directly to anyone who knows the URL.

## 14. Operational Characteristics

### Strengths

- Simple local architecture.
- Easy to run for a demo or pilot.
- Clear separation between frontend and backend.
- No external database dependency.
- Generated assets are easily inspectable on disk.
- The panel model is flexible and manually editable.

### Constraints

- Long-running generation requests can time out.
- Generation is not queued or resumable.
- Multiple admins generating the same story concurrently can race.
- SQLite limits write concurrency.
- Local disk storage does not scale horizontally.
- Old generated assets can accumulate.
- No deployment scripts, Dockerfile, or CI workflow are present.
- No automated backend or frontend tests are present.

## 15. Tradeoffs

### SQLite vs Managed Database

SQLite keeps setup simple and works well for a prototype. The tradeoff is limited concurrent writes, limited operational tooling, and manual backup/restore.

For production, PostgreSQL or another managed relational database would be safer.

### Local Uploads vs Object Storage

Local storage keeps media handling simple. The tradeoff is that media is tied to one server instance and must be backed up manually.

For production, use S3-compatible object storage, signed URLs, lifecycle policies, and malware scanning.

### Synchronous Generation vs Background Jobs

Synchronous generation is easy to reason about. The tradeoff is poor resilience for slow AI calls and no progress updates beyond the frontend spinner.

For production, use a job queue, background worker, and status polling or WebSockets.

### Custom Auth vs Enterprise SSO

Custom auth is lightweight for demos. The tradeoff is security, governance, and user lifecycle risk.

For Nomura-scale internal use, integrate with enterprise identity and restrict admin provisioning.

### Direct OpenAI Calls From Backend Utility Code

The current code avoids extra SDK dependencies and keeps calls explicit. The tradeoff is more manual request/response handling and less benefit from typed SDK support.

## 16. What Can Be Improved

### Priority 0: Enterprise Readiness

- Remove self-service admin registration.
- Integrate SSO/OIDC/SAML.
- Enforce role assignment through an admin console or identity groups.
- Require a strong configured `SECRET_KEY`.
- Add audit logs for admin actions and generation events.
- Add upload scanning and file-type enforcement.
- Make `/uploads` private or signed.

### Priority 1: Reliability

- Move generation to a background job queue.
- Add job statuses: queued, running, failed, completed.
- Store generation errors per story.
- Add retries with backoff for transient OpenAI failures.
- Add cancellation support.
- Prevent concurrent generation for the same story.

### Priority 2: Data And Storage

- Move SQLite to PostgreSQL for shared environments.
- Add Alembic or another migration framework.
- Move media to object storage.
- Add cleanup for orphaned images/audio after regeneration or story deletion.
- Store media metadata separately for traceability.

### Priority 3: Content Quality

- Parse PDF/DOCX/PPTX content instead of only storing them.
- Include character dialogue in narration, or generate richer scene audio.
- Add review/approval workflow before publishing.
- Track prompt version, model version, and generation parameters.
- Add regeneration per panel instead of replacing all panels.
- Add localization support for Japanese/English content.

### Priority 4: Testing And CI

- Add backend unit tests for auth, access control, story CRUD, and generation error handling.
- Add frontend tests for role routing and critical workflows.
- Add contract tests for API payloads.
- Add CI build checks with Node 20.19+ or 22.12+.
- Add linting and formatting.

## 17. Observed Build And Verification Notes

Backend syntax compilation passed with the project virtual environment:

```text
./venv/bin/python -m compileall app
```

Frontend TypeScript build passed:

```text
./node_modules/.bin/tsc -b
```

Full frontend build did not complete in the current local environment because installed Vite requires Node.js 20.19+ or 22.12+, while the machine has Node.js 18.12.1:

```text
npm run build
```

This should be resolved by upgrading Node for the project environment.

## 18. Deployment View

### Minimum Demo Deployment

- One backend process.
- One frontend build served by a static host.
- SQLite file stored on persistent disk.
- Upload folder stored on persistent disk.
- Environment variables configured for OpenAI and auth.

### Recommended Production Direction

- Frontend served via enterprise-approved static hosting.
- Backend deployed as containerized FastAPI service.
- PostgreSQL database.
- Object storage for media.
- Background worker service for generation jobs.
- Enterprise SSO.
- Centralized logs, metrics, and audit trails.
- Secrets managed through a vault or cloud secret manager.

## 19. Key Risks

- Unauthorized admin creation due to self-service role selection.
- Sensitive source documents could be uploaded to local disk without scanning or encryption controls.
- OpenAI prompts may include internal business content, requiring data handling review.
- Local media URLs are publicly accessible through the backend once known.
- No audit trail for who generated or published content.
- No automated tests for permission-sensitive paths.
- Synchronous generation can create poor user experience under latency or API throttling.
- Generated media can accumulate and increase storage cost.

## 20. Open Questions For Stakeholders

- Should this platform use Nomura SSO and group-based admin authorization?
- What kinds of internal documents are allowed to be sent to AI services?
- Is generated content required to go through compliance review before publishing?
- Should stories support Japanese, English, or both?
- What is the expected number of admins, readers, stories, and generated panels per month?
- What retention policy should apply to generated images/audio and uploaded source documents?
- Should reader analytics be aggregated for training completion reporting?
- Is offline access or mobile support required?

## 21. Suggested Roadmap

### Phase 1: Controlled Pilot

- Restrict admin creation.
- Add deployment documentation.
- Upgrade Node version.
- Add baseline tests.
- Add a manual approval process for published stories.

### Phase 2: Enterprise Hardening

- Add SSO.
- Add audit logs.
- Add background job processing.
- Add object storage.
- Add PDF/DOCX/PPTX parsing.

### Phase 3: Scaled Learning Platform

- Add analytics dashboards.
- Add multi-language support.
- Add per-panel regeneration.
- Add prompt/model versioning.
- Add training-completion exports.

## 22. File Map

### Backend

- `backend/app/main.py`: API routes, role checks, story CRUD, generation endpoints, document endpoints, read progress.
- `backend/app/db.py`: SQLite connection, schema initialization, upload directory config.
- `backend/app/security.py`: password hashing and custom token creation/verification.
- `backend/app/schemas.py`: Pydantic request models and allowed literals.
- `backend/app/generation.py`: OpenAI calls, prompt construction, panel normalization, image/audio storage, document text extraction.
- `backend/schema.sql`: database schema.
- `backend/requirements.txt`: backend dependencies.

### Frontend

- `frontend/src/App.tsx`: role-based top-level routing.
- `frontend/src/lib/api.ts`: REST API client, token handling, media URL resolution.
- `frontend/src/lib/auth.tsx`: auth context and session state.
- `frontend/src/lib/types.ts`: TypeScript domain models.
- `frontend/src/components/AuthPage.tsx`: sign-in/register UI.
- `frontend/src/components/AdminDashboard.tsx`: admin story management.
- `frontend/src/components/StoryEditor.tsx`: story/panel/document/generation editor.
- `frontend/src/components/UserDashboard.tsx`: reader story catalog and progress summary.
- `frontend/src/components/MangaReader.tsx`: panel reader and narration playback.
- `frontend/src/index.css`: global styles and manga-specific helper classes.

## 23. Final Assessment

This project is a strong prototype for an internal AI-powered manga learning platform. It already demonstrates the complete loop: authenticated admin creation, AI generation, persisted stories, published reader experience, and reading progress.

For a Nomura production context, the most important next step is not more UI polish. It is governance: enterprise identity, controlled admin access, auditability, secure document/media handling, and reliable asynchronous generation. Once those are in place, the platform can mature from a compelling demo into a governed internal learning product.
