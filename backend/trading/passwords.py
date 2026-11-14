"""Password hashing with scrypt from Python's standard library.

scrypt is a slow, memory-hard password hash in the same class as bcrypt and
argon2, and needs no extra install. Each password gets its own random salt, and
the stored string records the settings, so they can be raised later without
breaking existing accounts:

    scrypt$16384$8$1$<salt, base64>$<hash, base64>
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os

N, R, P, KEY_LENGTH = 2**14, 8, 1, 32


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=N, r=R, p=P, dklen=KEY_LENGTH)
    return f"scrypt${N}${R}${P}${_b64(salt)}${_b64(key)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, key = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(key)
        actual = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt),
                                n=int(n), r=int(r), p=int(p), dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)  # constant time


# Checked against when the username doesn't exist, so a wrong username takes as
# long as a wrong password and response times don't reveal which usernames exist.
DUMMY_HASH = hash_password("not-a-real-password")
