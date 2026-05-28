import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any

SECRET_KEY = os.getenv('SECRET_KEY', 'change-this-dev-secret')
TOKEN_TTL_SECONDS = int(os.getenv('TOKEN_TTL_SECONDS', str(60 * 60 * 24 * 7)))
PASSWORD_ITERATIONS = 210_000


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip('=')


def _unb64(data: str) -> bytes:
    padding = '=' * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, PASSWORD_ITERATIONS)
    return f'pbkdf2_sha256${PASSWORD_ITERATIONS}${_b64(salt)}${_b64(digest)}'


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = password_hash.split('$')
        if algorithm != 'pbkdf2_sha256':
            return False
        salt = _unb64(salt_b64)
        expected = _unb64(digest_b64)
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload: dict[str, Any] = {'sub': user_id, 'exp': int(time.time()) + TOKEN_TTL_SECONDS}
    payload_bytes = json.dumps(payload, separators=(',', ':')).encode()
    payload_b64 = _b64(payload_bytes)
    signature = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).digest()
    return f'{payload_b64}.{_b64(signature)}'


def verify_token(token: str) -> str | None:
    try:
        payload_b64, signature_b64 = token.split('.', 1)
        expected_sig = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected_sig, _unb64(signature_b64)):
            return None
        payload = json.loads(_unb64(payload_b64))
        if int(payload['exp']) < int(time.time()):
            return None
        return str(payload['sub'])
    except Exception:
        return None
