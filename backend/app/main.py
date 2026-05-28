from __future__ import annotations

import os
import re
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db import UPLOAD_DIR, get_connection, init_db
from .generation import (
    GenerationConfigError,
    GenerationError,
    document_context_from_uploads,
    generate_panel_image,
    generate_panel_narration,
    generate_panel_script,
)
from .schemas import (
    GenerateMangaIn,
    PanelsReplaceIn,
    ReadUpdateIn,
    SignInIn,
    SignUpIn,
    StoryIn,
    StoryUpdateIn,
)
from .security import create_token, hash_password, verify_password, verify_token

app = FastAPI(title='Manga Stories Backend')
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

origins = [origin.strip() for origin in os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.mount('/uploads', StaticFiles(directory=str(UPLOAD_DIR)), name='uploads')


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid4())


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row else None


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(row) for row in rows]


def public_profile(row: dict) -> dict:
    return {
        'id': row['id'],
        'email': row['email'],
        'full_name': row['full_name'],
        'role': row['role'],
        'department': row.get('department'),
        'created_at': row.get('created_at'),
        'updated_at': row.get('updated_at'),
    }


def user_payload(profile: dict) -> dict:
    return {'id': profile['id'], 'email': profile['email']}


def normalize_completed(read: dict) -> dict:
    read['completed'] = bool(read.get('completed'))
    return read


def get_current_profile(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Missing authorization token')
    token = authorization.removeprefix('Bearer ').strip()
    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail='Invalid or expired token')
    with get_connection() as conn:
        row = conn.execute('SELECT * FROM profiles WHERE id = ?', (user_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail='User no longer exists')
    return dict(row)


def require_admin(profile: dict = Depends(get_current_profile)) -> dict:
    if profile['role'] != 'admin':
        raise HTTPException(status_code=403, detail='Admin access required')
    return profile


def story_with_counts(story: dict) -> dict:
    with get_connection() as conn:
        panel_count = conn.execute('SELECT COUNT(*) AS c FROM story_panels WHERE story_id = ?', (story['id'],)).fetchone()['c']
        doc_count = conn.execute('SELECT COUNT(*) AS c FROM documents WHERE story_id = ?', (story['id'],)).fetchone()['c']
        creator = conn.execute('SELECT full_name, email FROM profiles WHERE id = ?', (story['created_by'],)).fetchone()
    story['story_panels'] = [{'count': panel_count}]
    story['documents'] = [{'count': doc_count}]
    if creator:
        story['profiles'] = dict(creator)
    return story


def get_story_or_404(story_id: str) -> dict:
    with get_connection() as conn:
        row = conn.execute('SELECT * FROM stories WHERE id = ?', (story_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail='Story not found')
    return dict(row)


def ensure_story_access(story_id: str, profile: dict, *, admin_only: bool = False) -> dict:
    story = get_story_or_404(story_id)
    if admin_only and profile['role'] != 'admin':
        raise HTTPException(status_code=403, detail='Admin access required')
    if profile['role'] == 'admin' or story['status'] == 'published' or story['created_by'] == profile['id']:
        return story
    raise HTTPException(status_code=403, detail='You do not have access to this story')


@app.on_event('startup')
def on_startup() -> None:
    init_db()


@app.get('/api/health')
def health() -> dict:
    return {'ok': True}


@app.post('/api/auth/signup')
def signup(payload: SignUpIn) -> dict:
    user_id = new_id()
    timestamp = now_iso()
    try:
        with get_connection() as conn:
            conn.execute(
                '''
                INSERT INTO profiles (id, email, password_hash, full_name, role, department, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    user_id,
                    payload.email.lower(),
                    hash_password(payload.password),
                    payload.full_name.strip(),
                    payload.role,
                    payload.department,
                    timestamp,
                    timestamp,
                ),
            )
            conn.commit()
            row = conn.execute('SELECT * FROM profiles WHERE id = ?', (user_id,)).fetchone()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail='Email is already registered')

    profile = public_profile(dict(row))
    return {'token': create_token(profile['id']), 'user': user_payload(profile), 'profile': profile}


@app.post('/api/auth/signin')
def signin(payload: SignInIn) -> dict:
    with get_connection() as conn:
        row = conn.execute('SELECT * FROM profiles WHERE email = ?', (payload.email.lower(),)).fetchone()
    if not row or not verify_password(payload.password, row['password_hash']):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    profile = public_profile(dict(row))
    return {'token': create_token(profile['id']), 'user': user_payload(profile), 'profile': profile}


@app.get('/api/auth/me')
def me(profile: dict = Depends(get_current_profile)) -> dict:
    profile_public = public_profile(profile)
    return {'user': user_payload(profile_public), 'profile': profile_public}


@app.get('/api/admin/stories')
def admin_stories(_: dict = Depends(require_admin)) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute('SELECT * FROM stories ORDER BY created_at DESC').fetchall()
    return [story_with_counts(dict(row)) for row in rows]


@app.get('/api/stories')
def list_stories(status: str | None = None, profile: dict = Depends(get_current_profile)) -> list[dict]:
    query = 'SELECT * FROM stories'
    params: list[str] = []
    clauses: list[str] = []

    if status:
        clauses.append('status = ?')
        params.append(status)
    elif profile['role'] != 'admin':
        clauses.append("status = 'published'")

    if clauses:
        query += ' WHERE ' + ' AND '.join(clauses)
    query += ' ORDER BY COALESCE(published_at, created_at) DESC'

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [story_with_counts(dict(row)) for row in rows]


@app.post('/api/stories')
def create_story(payload: StoryIn, profile: dict = Depends(require_admin)) -> dict:
    story_id = new_id()
    timestamp = now_iso()
    published_at = timestamp if payload.status == 'published' else None
    with get_connection() as conn:
        conn.execute(
            '''
            INSERT INTO stories (id, title, description, category, context_prompt, cover_image_url, created_by, status, published_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                story_id,
                payload.title,
                payload.description,
                payload.category,
                payload.context_prompt,
                payload.cover_image_url,
                profile['id'],
                payload.status,
                published_at,
                timestamp,
                timestamp,
            ),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM stories WHERE id = ?', (story_id,)).fetchone()
    return dict(row)


@app.patch('/api/stories/{story_id}')
def update_story(story_id: str, payload: StoryUpdateIn, profile: dict = Depends(require_admin)) -> dict:
    get_story_or_404(story_id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return get_story_or_404(story_id)

    if updates.get('status') == 'published' and 'published_at' not in updates:
        updates['published_at'] = now_iso()
    if updates.get('status') == 'draft':
        updates['published_at'] = None
    updates['updated_at'] = now_iso()

    fields = ', '.join(f'{key} = ?' for key in updates.keys())
    values = list(updates.values()) + [story_id]
    with get_connection() as conn:
        conn.execute(f'UPDATE stories SET {fields} WHERE id = ?', values)
        conn.commit()
        row = conn.execute('SELECT * FROM stories WHERE id = ?', (story_id,)).fetchone()
    return dict(row)


@app.delete('/api/stories/{story_id}')
def delete_story(story_id: str, _: dict = Depends(require_admin)) -> dict:
    get_story_or_404(story_id)
    with get_connection() as conn:
        conn.execute('DELETE FROM stories WHERE id = ?', (story_id,))
        conn.commit()
    return {'success': True}


@app.get('/api/stories/{story_id}/panels')
def get_panels(story_id: str, profile: dict = Depends(get_current_profile)) -> list[dict]:
    ensure_story_access(story_id, profile)
    with get_connection() as conn:
        rows = conn.execute('SELECT * FROM story_panels WHERE story_id = ? ORDER BY panel_number ASC', (story_id,)).fetchall()
    return rows_to_dicts(rows)


@app.put('/api/stories/{story_id}/panels')
def replace_panels(story_id: str, payload: PanelsReplaceIn, profile: dict = Depends(require_admin)) -> list[dict]:
    ensure_story_access(story_id, profile, admin_only=True)
    timestamp = now_iso()
    with get_connection() as conn:
        conn.execute('DELETE FROM story_panels WHERE story_id = ?', (story_id,))
        for panel in payload.panels:
            conn.execute(
                '''
                INSERT INTO story_panels (id, story_id, panel_number, title, narrative_text, narration_audio_url, narration_duration_ms, image_url, image_prompt, panel_type, character_name, character_dialogue, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    new_id(),
                    story_id,
                    panel.panel_number,
                    panel.title,
                    panel.narrative_text,
                    panel.narration_audio_url,
                    panel.narration_duration_ms,
                    panel.image_url,
                    panel.image_prompt,
                    panel.panel_type,
                    panel.character_name,
                    panel.character_dialogue,
                    timestamp,
                ),
            )
        conn.execute('UPDATE stories SET updated_at = ? WHERE id = ?', (timestamp, story_id))
        conn.commit()
        rows = conn.execute('SELECT * FROM story_panels WHERE story_id = ? ORDER BY panel_number ASC', (story_id,)).fetchall()
    return rows_to_dicts(rows)


def set_story_status(story_id: str, status: str) -> None:
    with get_connection() as conn:
        conn.execute('UPDATE stories SET status = ?, updated_at = ? WHERE id = ?', (status, now_iso(), story_id))
        conn.commit()


def generation_documents(story_id: str, document_ids: list[str]) -> list[dict]:
    if not document_ids:
        return []
    placeholders = ','.join('?' for _ in document_ids)
    with get_connection() as conn:
        rows = conn.execute(
            f'''
            SELECT * FROM documents
            WHERE story_id = ? AND id IN ({placeholders})
            ORDER BY created_at DESC
            ''',
            [story_id, *document_ids],
        ).fetchall()
    return rows_to_dicts(rows)


@app.post('/api/stories/{story_id}/generate-manga')
def generate_manga(story_id: str, payload: GenerateMangaIn, profile: dict = Depends(require_admin)) -> dict:
    story = ensure_story_access(story_id, profile, admin_only=True)
    original_status = story['status']
    final_status = original_status if original_status != 'generating' else 'draft'
    set_story_status(story_id, 'generating')

    try:
        title = payload.title.strip() or story['title']
        description = payload.description.strip() or story.get('description', '')
        category = payload.category.strip() or story.get('category', 'Summary')
        context = payload.context.strip() or story.get('context_prompt', '')
        documents = generation_documents(story_id, payload.document_ids)
        document_context = document_context_from_uploads(story_id, documents)

        panels = generate_panel_script(
            title=title,
            description=description,
            category=category,
            context=context,
            document_context=document_context,
        )
        for panel in panels:
            panel['image_url'] = generate_panel_image(
                story_id=story_id,
                panel=panel,
                story_title=title,
                category=category,
            )
            panel['narration_audio_url'] = generate_panel_narration(
                story_id=story_id,
                panel=panel,
                story_title=title,
            )
            panel['narration_duration_ms'] = None

        stored = replace_panels(story_id, PanelsReplaceIn(panels=panels), profile)
        first_image = stored[0].get('image_url') if stored else None
        timestamp = now_iso()
        with get_connection() as conn:
            conn.execute(
                '''
                UPDATE stories
                SET cover_image_url = ?, status = ?, updated_at = ?
                WHERE id = ?
                ''',
                (first_image or story.get('cover_image_url'), final_status, timestamp, story_id),
            )
            conn.commit()
        return {'success': True, 'panels_generated': len(stored), 'panels': stored}
    except GenerationConfigError as exc:
        set_story_status(story_id, final_status)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except GenerationError as exc:
        set_story_status(story_id, final_status)
        status_code = exc.status_code if exc.status_code in {400, 401, 403, 429} else 502
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except Exception as exc:
        set_story_status(story_id, final_status)
        raise HTTPException(status_code=500, detail='Failed to generate manga panels.') from exc


@app.post('/api/stories/{story_id}/generate-narration')
def generate_story_narration(story_id: str, profile: dict = Depends(require_admin)) -> dict:
    story = ensure_story_access(story_id, profile, admin_only=True)
    with get_connection() as conn:
        rows = conn.execute('SELECT * FROM story_panels WHERE story_id = ? ORDER BY panel_number ASC', (story_id,)).fetchall()
    panels = rows_to_dicts(rows)
    if not panels:
        raise HTTPException(status_code=400, detail='Generate or add panels before generating narration.')

    try:
        for panel in panels:
            panel['narration_audio_url'] = generate_panel_narration(
                story_id=story_id,
                panel=panel,
                story_title=story['title'],
            )
            panel['narration_duration_ms'] = None

        timestamp = now_iso()
        with get_connection() as conn:
            for panel in panels:
                conn.execute(
                    '''
                    UPDATE story_panels
                    SET narration_audio_url = ?, narration_duration_ms = ?
                    WHERE id = ?
                    ''',
                    (panel.get('narration_audio_url'), panel.get('narration_duration_ms'), panel['id']),
                )
            conn.execute('UPDATE stories SET updated_at = ? WHERE id = ?', (timestamp, story_id))
            conn.commit()
            updated = conn.execute('SELECT * FROM story_panels WHERE story_id = ? ORDER BY panel_number ASC', (story_id,)).fetchall()
        return {'success': True, 'panels_generated': len(panels), 'panels': rows_to_dicts(updated)}
    except GenerationConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except GenerationError as exc:
        status_code = exc.status_code if exc.status_code in {400, 401, 403, 429} else 502
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail='Failed to generate story narration.') from exc


@app.get('/api/stories/{story_id}/documents')
def get_documents(story_id: str, profile: dict = Depends(get_current_profile)) -> list[dict]:
    ensure_story_access(story_id, profile)
    with get_connection() as conn:
        rows = conn.execute('SELECT * FROM documents WHERE story_id = ? ORDER BY created_at DESC', (story_id,)).fetchall()
    return rows_to_dicts(rows)


def safe_filename(name: str) -> str:
    stem = re.sub(r'[^A-Za-z0-9._-]+', '_', Path(name).name).strip('._')
    return stem or 'upload.bin'


@app.post('/api/stories/{story_id}/documents')
def upload_document(story_id: str, file: UploadFile = File(...), profile: dict = Depends(require_admin)) -> dict:
    ensure_story_access(story_id, profile, admin_only=True)
    timestamp = now_iso()
    doc_id = new_id()
    story_dir = UPLOAD_DIR / story_id
    story_dir.mkdir(parents=True, exist_ok=True)
    filename = f'{int(datetime.now().timestamp())}-{safe_filename(file.filename or "upload")}'
    destination = story_dir / filename
    with destination.open('wb') as out_file:
        shutil.copyfileobj(file.file, out_file)

    file_url = f'/uploads/{story_id}/{filename}'
    file_type = Path(filename).suffix.removeprefix('.') or 'unknown'
    file_size = destination.stat().st_size
    with get_connection() as conn:
        conn.execute(
            '''
            INSERT INTO documents (id, story_id, file_name, file_url, file_type, file_size, uploaded_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (doc_id, story_id, file.filename or filename, file_url, file_type, file_size, profile['id'], timestamp),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM documents WHERE id = ?', (doc_id,)).fetchone()
    return dict(row)


@app.delete('/api/documents/{document_id}')
def delete_document(document_id: str, profile: dict = Depends(require_admin)) -> dict:
    with get_connection() as conn:
        row = conn.execute('SELECT * FROM documents WHERE id = ?', (document_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail='Document not found')
        document = dict(row)
        ensure_story_access(document['story_id'], profile, admin_only=True)
        conn.execute('DELETE FROM documents WHERE id = ?', (document_id,))
        conn.commit()

    file_path = UPLOAD_DIR.parent / document['file_url'].lstrip('/')
    if file_path.exists() and file_path.is_file():
        file_path.unlink(missing_ok=True)
    return {'success': True}


@app.get('/api/me/reads')
def my_reads(profile: dict = Depends(get_current_profile)) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute('SELECT * FROM story_reads WHERE user_id = ?', (profile['id'],)).fetchall()
    return [normalize_completed(dict(row)) for row in rows]


@app.post('/api/stories/{story_id}/read')
def get_or_create_read(story_id: str, profile: dict = Depends(get_current_profile)) -> dict:
    ensure_story_access(story_id, profile)
    timestamp = now_iso()
    with get_connection() as conn:
        row = conn.execute(
            'SELECT * FROM story_reads WHERE story_id = ? AND user_id = ?',
            (story_id, profile['id']),
        ).fetchone()
        if not row:
            read_id = new_id()
            conn.execute(
                '''
                INSERT INTO story_reads (id, story_id, user_id, last_panel_read, completed, created_at, updated_at)
                VALUES (?, ?, ?, 1, 0, ?, ?)
                ''',
                (read_id, story_id, profile['id'], timestamp, timestamp),
            )
            conn.commit()
            row = conn.execute('SELECT * FROM story_reads WHERE id = ?', (read_id,)).fetchone()
    return normalize_completed(dict(row))


@app.patch('/api/reads/{read_id}')
def update_read(read_id: str, payload: ReadUpdateIn, profile: dict = Depends(get_current_profile)) -> dict:
    with get_connection() as conn:
        row = conn.execute('SELECT * FROM story_reads WHERE id = ?', (read_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail='Read progress not found')
        read = dict(row)
        if read['user_id'] != profile['id'] and profile['role'] != 'admin':
            raise HTTPException(status_code=403, detail='You can only update your own reading progress')
        conn.execute(
            'UPDATE story_reads SET last_panel_read = ?, completed = ?, updated_at = ? WHERE id = ?',
            (payload.last_panel_read, 1 if payload.completed else 0, now_iso(), read_id),
        )
        conn.commit()
        updated = conn.execute('SELECT * FROM story_reads WHERE id = ?', (read_id,)).fetchone()
    return normalize_completed(dict(updated))
