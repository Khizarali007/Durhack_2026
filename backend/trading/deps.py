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


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Database = Depends(get_db),
) -> User:
    """The logged-in user, from an `Authorization: Bearer <token>` header."""
    user = user_for_token(db, credentials.credentials) if credentials else None
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "missing or invalid session token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
