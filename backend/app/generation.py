from __future__ import annotations

import base64
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from uuid import uuid4

from .db import UPLOAD_DIR

PANEL_TYPES = {'cover', 'narration', 'dialogue', 'action', 'summary'}
MIN_PANEL_COUNT = 5
MAX_PANEL_COUNT = 20
MAX_TTS_INPUT_CHARS = 4096


class GenerationConfigError(RuntimeError):
    pass


class GenerationError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def _env_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return max(minimum, min(maximum, value))


def _env_float(name: str, default: float, *, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        return default
    return max(minimum, min(maximum, value))


def _openai_api_key() -> str:
    key = os.getenv('OPENAI_API_KEY')
    if not key:
        raise GenerationConfigError('Missing OPENAI_API_KEY in the backend environment.')
    return key


def _post_openai(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    base_url = os.getenv('OPENAI_API_BASE_URL', 'https://api.openai.com/v1').rstrip('/')
    data = json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(
        f'{base_url}{path}',
        data=data,
        method='POST',
        headers={
            'Authorization': f'Bearer {_openai_api_key()}',
            'Content-Type': 'application/json',
        },
    )
    timeout = _env_int('OPENAI_TIMEOUT_SECONDS', 180, minimum=10, maximum=300)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode('utf-8', errors='replace')
        message = _extract_error_message(body) or exc.reason or 'OpenAI API request failed'
        raise GenerationError(f'OpenAI API error ({exc.code}): {message}', exc.code) from exc
    except urllib.error.URLError as exc:
        raise GenerationError(f'Could not reach OpenAI API: {exc.reason}') from exc
    except json.JSONDecodeError as exc:
        raise GenerationError('OpenAI API returned invalid JSON.') from exc


def _post_openai_bytes(path: str, payload: dict[str, Any]) -> bytes:
    base_url = os.getenv('OPENAI_API_BASE_URL', 'https://api.openai.com/v1').rstrip('/')
    data = json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(
        f'{base_url}{path}',
        data=data,
        method='POST',
        headers={
            'Authorization': f'Bearer {_openai_api_key()}',
            'Content-Type': 'application/json',
        },
    )
    timeout = _env_int('OPENAI_TIMEOUT_SECONDS', 180, minimum=10, maximum=300)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode('utf-8', errors='replace')
        message = _extract_error_message(body) or exc.reason or 'OpenAI API request failed'
        raise GenerationError(f'OpenAI API error ({exc.code}): {message}', exc.code) from exc
    except urllib.error.URLError as exc:
        raise GenerationError(f'Could not reach OpenAI API: {exc.reason}') from exc


def _extract_error_message(body: str) -> str:
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return body.strip()[:500]
    error = payload.get('error')
    if isinstance(error, dict):
        return str(error.get('message') or error)
    return str(payload)[:500]


def _response_openai_message_text(response: dict[str, Any]) -> str:
    choices = response.get('choices')
    if not isinstance(choices, list) or not choices:
        return ''

    message = choices[0].get('message') if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        return ''

    content = message.get('content')
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        pieces: list[str] = []
        for part in content:
            if isinstance(part, dict) and isinstance(part.get('text'), str):
                pieces.append(part['text'])
        return '\n'.join(pieces).strip()
    return ''


def _panel_schema(panel_count: int) -> dict[str, Any]:
    return {
        'type': 'object',
        'additionalProperties': False,
        'properties': {
            'panels': {
                'type': 'array',
                'minItems': panel_count,
                'maxItems': panel_count,
                'items': {
                    'type': 'object',
                    'additionalProperties': False,
                    'properties': {
                        'panel_number': {'type': 'integer'},
                        'title': {'type': 'string'},
                        'narrative_text': {'type': 'string'},
                        'image_prompt': {'type': 'string'},
                        'panel_type': {
                            'type': 'string',
                            'enum': ['cover', 'narration', 'dialogue', 'action', 'summary'],
                        },
                        'character_name': {'type': 'string'},
                        'character_dialogue': {'type': 'string'},
                    },
                    'required': [
                        'panel_number',
                        'title',
                        'narrative_text',
                        'image_prompt',
                        'panel_type',
                        'character_name',
                        'character_dialogue',
                    ],
                },
            },
        },
        'required': ['panels'],
    }


def _story_prompt(
    *,
    title: str,
    description: str,
    category: str,
    context: str,
    document_context: str,
    panel_count: int,
) -> str:
    return f"""
You are a manga storyboard director creating internal learning manga.

Create a complete, coherent manga story from the admin's inputs. Return exactly {panel_count} panels.
The output must fit the database schema:
- panel_number: 1-based integer.
- title: short panel title.
- narrative_text: 1-3 concise sentences for the reader overlay.
- image_prompt: a detailed prompt for generating the panel image in manga style.
- panel_type: one of cover, narration, dialogue, action, summary.
- character_name and character_dialogue: use empty strings when no dialogue is needed.

Rules:
- Panel 1 must be a cover/opening panel.
- The final panel must be a takeaway or resolution.
- Make the story specific to the provided context and category.
- Keep dialogue short enough to fit a speech bubble.
- Image prompts must ask for a clean manga panel with no embedded captions, no readable UI text, no speech bubbles, and no watermark because the app overlays text separately.
- Keep recurring characters visually consistent across image prompts.

Admin inputs:
Title: {title}
Description: {description or '(none)'}
Category: {category}
Story context and prompt: {context or '(none)'}
Reference documents: {document_context or '(none)'}
""".strip()


def generate_panel_script(
    *,
    title: str,
    description: str,
    category: str,
    context: str,
    document_context: str = '',
) -> list[dict[str, Any]]:
    panel_count = _env_int('MANGA_PANEL_COUNT', MIN_PANEL_COUNT, minimum=MIN_PANEL_COUNT, maximum=MAX_PANEL_COUNT)
    text_model = os.getenv('OPENAI_TEXT_MODEL', 'gpt-4o-mini')
    response = _post_openai(
        '/chat/completions',
        {
            'model': text_model,
            'messages': [
                {
                    'role': 'system',
                    'content': 'You create manga storyboard panel scripts. Return only valid JSON that matches the requested schema.',
                },
                {
                    'role': 'user',
                    'content': _story_prompt(
                        title=title,
                        description=description,
                        category=category,
                        context=context,
                        document_context=document_context,
                        panel_count=panel_count,
                    ),
                },
            ],
            'response_format': {
                'type': 'json_schema',
                'json_schema': {
                    'name': 'manga_panel_script',
                    'strict': True,
                    'schema': _panel_schema(panel_count),
                },
            },
        },
    )
    text = _response_openai_message_text(response)
    if not text:
        raise GenerationError('OpenAI did not return a story script.')
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise GenerationError('OpenAI returned a story script that was not valid JSON.') from exc
    panels = payload.get('panels')
    if not isinstance(panels, list) or not panels:
        raise GenerationError('OpenAI returned a story script with no panels.')
    return _normalize_panels(panels)


def _normalize_panels(panels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, panel in enumerate(panels, start=1):
        panel_type = str(panel.get('panel_type') or 'narration').lower()
        if panel_type not in PANEL_TYPES:
            panel_type = 'narration'
        if index == 1:
            panel_type = 'cover'
        elif index == len(panels):
            panel_type = 'summary'

        normalized.append(
            {
                'panel_number': index,
                'title': _compact(panel.get('title'), fallback=f'Panel {index}', limit=80),
                'narrative_text': _compact(panel.get('narrative_text'), limit=700),
                'image_url': None,
                'image_prompt': _compact(panel.get('image_prompt'), limit=1800),
                'panel_type': panel_type,
                'character_name': _compact(panel.get('character_name'), limit=60),
                'character_dialogue': _compact(panel.get('character_dialogue'), limit=220),
            }
        )
    return normalized


def _compact(value: Any, *, fallback: str = '', limit: int = 500) -> str:
    text = re.sub(r'\s+', ' ', str(value or fallback)).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + '...'


def generate_panel_image(*, story_id: str, panel: dict[str, Any], story_title: str, category: str) -> str:
    return _generate_openai_panel_image(
        story_id=story_id,
        panel=panel,
        story_title=story_title,
        category=category,
    )


def generate_panel_narration(*, story_id: str, panel: dict[str, Any], story_title: str) -> str | None:
    narration_text = _panel_narration_input(panel)
    if not narration_text:
        return None

    tts_model = os.getenv('OPENAI_TTS_MODEL', 'gpt-4o-mini-tts')
    voice = os.getenv('OPENAI_TTS_VOICE', 'marin')
    response_format = os.getenv('OPENAI_TTS_RESPONSE_FORMAT', 'mp3').lower()
    if response_format not in {'mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'}:
        response_format = 'mp3'
    instructions = os.getenv(
        'OPENAI_TTS_INSTRUCTIONS',
        'Narrate as a clear, warm manga storyteller. Use natural pacing, expressive but professional tone, and brief pauses between ideas.',
    )
    payload: dict[str, Any] = {
        'model': tts_model,
        'voice': voice,
        'input': narration_text,
        'response_format': response_format,
    }
    if instructions and tts_model not in {'tts-1', 'tts-1-hd'}:
        payload['instructions'] = instructions

    speed = _env_float('OPENAI_TTS_SPEED', 1.0, minimum=0.25, maximum=4.0)
    if speed != 1.0:
        payload['speed'] = speed

    audio_bytes = _post_openai_bytes('/audio/speech', payload)
    if not audio_bytes:
        raise GenerationError('OpenAI did not return narration audio.')

    story_dir = UPLOAD_DIR / story_id
    story_dir.mkdir(parents=True, exist_ok=True)
    extension = _extension_for_audio_format(response_format)
    filename = f'narration-panel-{panel["panel_number"]:02d}-{uuid4().hex[:10]}.{extension}'
    destination = story_dir / filename
    destination.write_bytes(audio_bytes)
    return f'/uploads/{story_id}/{filename}'


def _panel_narration_input(panel: dict[str, Any]) -> str:
    narrative = str(panel.get('narrative_text') or '').strip()
    return _compact(narrative, limit=MAX_TTS_INPUT_CHARS)


def _generate_openai_panel_image(*, story_id: str, panel: dict[str, Any], story_title: str, category: str) -> str:
    image_model = os.getenv('OPENAI_IMAGE_MODEL', 'gpt-image-1-mini')
    size = os.getenv('OPENAI_IMAGE_SIZE') or _openai_size_from_aspect_ratio(os.getenv('MANGA_IMAGE_ASPECT_RATIO', '3:4'))
    quality = os.getenv('OPENAI_IMAGE_QUALITY', 'low')
    output_format = os.getenv('OPENAI_IMAGE_OUTPUT_FORMAT', 'png').lower()
    prompt = f"""
Create one finished manga panel image for this story.

Story: {story_title}
Category: {category}
Panel {panel['panel_number']}: {panel['title']}
Narrative purpose: {panel['narrative_text']}
Visual direction: {panel['image_prompt']}

Style requirements:
- Professional Japanese manga/comic panel illustration.
- Crisp, high-contrast black-and-white ink work with subtle cinematic lighting.
- No written text, no captions, no speech bubbles, no logos, no watermarks.
- Strong composition that leaves some open space for app-rendered overlay text.
""".strip()
    response = _post_openai(
        '/images/generations',
        {
            'model': image_model,
            'prompt': prompt,
            'n': 1,
            'size': size,
            'quality': quality,
            'output_format': output_format,
        },
    )
    image_bytes, extension = _response_openai_image(response, output_format=output_format)
    story_dir = UPLOAD_DIR / story_id
    story_dir.mkdir(parents=True, exist_ok=True)
    filename = f'ai-panel-{panel["panel_number"]:02d}-{uuid4().hex[:10]}.{extension}'
    destination = story_dir / filename
    destination.write_bytes(image_bytes)
    return f'/uploads/{story_id}/{filename}'


def _openai_size_from_aspect_ratio(aspect_ratio: str) -> str:
    if aspect_ratio == '4:3':
        return '1536x1024'
    if aspect_ratio == '1:1':
        return '1024x1024'
    return '1024x1536'


def _response_openai_image(response: dict[str, Any], *, output_format: str) -> tuple[bytes, str]:
    data = response.get('data')
    if not isinstance(data, list) or not data:
        raise GenerationError('OpenAI did not return image data.')

    item = data[0]
    if not isinstance(item, dict):
        raise GenerationError('OpenAI returned an unexpected image payload.')

    encoded = item.get('b64_json')
    if encoded:
        return base64.b64decode(encoded), _extension_for_output_format(output_format)

    image_url = item.get('url')
    if image_url:
        return _download_image_url(image_url), _extension_for_output_format(output_format)

    raise GenerationError('OpenAI did not return b64_json or url image data.')


def _download_image_url(image_url: str) -> bytes:
    timeout = _env_int('OPENAI_TIMEOUT_SECONDS', 180, minimum=10, maximum=300)
    try:
        with urllib.request.urlopen(image_url, timeout=timeout) as response:
            return response.read()
    except urllib.error.URLError as exc:
        raise GenerationError(f'Could not download OpenAI image: {exc.reason}') from exc


def _extension_for_output_format(output_format: str) -> str:
    if output_format == 'jpeg':
        return 'jpg'
    if output_format == 'webp':
        return 'webp'
    return 'png'


def _extension_for_audio_format(response_format: str) -> str:
    if response_format == 'mpeg':
        return 'mp3'
    if response_format in {'mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'}:
        return response_format
    return 'mp3'


def document_context_from_uploads(story_id: str, documents: list[dict[str, Any]]) -> str:
    if not documents:
        return ''

    parts: list[str] = []
    for document in documents:
        file_name = str(document.get('file_name') or 'document')
        file_type = str(document.get('file_type') or '').lower()
        file_url = str(document.get('file_url') or '')
        parts.append(f'- {file_name} ({file_type or "unknown"})')

        if file_type not in {'txt', 'md', 'markdown', 'csv', 'json'}:
            continue

        local_path = _upload_path_from_url(file_url)
        if not local_path or not local_path.exists() or not local_path.is_file():
            continue

        try:
            text = local_path.read_text(encoding='utf-8', errors='replace')
        except OSError:
            continue

        text = _compact(text, limit=2500)
        if text:
            parts.append(f'  Excerpt: {text}')

    return '\n'.join(parts)[:8000]


def _upload_path_from_url(file_url: str) -> Path | None:
    if not file_url.startswith('/uploads/'):
        return None
    relative = file_url.removeprefix('/uploads/').lstrip('/')
    return UPLOAD_DIR / relative
