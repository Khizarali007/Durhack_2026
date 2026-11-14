"""FastAPI dependencies shared by Person 2's routes."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .accounts import User, user_for_token
from .db import Database

# auto_error=False so a missing token gives 401 (not FastAPI's default 403).
# It also adds an "Authorize" button to /docs.
_bearer = HTTPBearer(auto_error=False, description="The token from POST /trading/session")


def get_db(request: Request) -> Database:
    return request.app.state.trading_db


def _unauthorised() -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "missing or invalid session token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Database = Depends(get_db),
) -> User:
    """The logged-in user, from an `Authorization: Bearer <token>` header."""
    user = user_for_token(db, credentials.credentials) if credentials else None
    if user is None:
        raise _unauthorised()
    return user


def current_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Database = Depends(get_db),
) -> str:
    """The raw session token, once it's known to be valid (used by logout)."""
    if credentials is None or user_for_token(db, credentials.credentials) is None:
        raise _unauthorised()
    return credentials.credentials
