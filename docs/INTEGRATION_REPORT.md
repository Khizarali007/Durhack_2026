# Integration report

Status of `main` after Phase 1 (one codebase that runs from a fresh clone).
Phase 2 items are added below as they land.

## Phase 1: done and on main
- All 9 remote branches are ancestors of `main` (real merges). Archive tags: `archive/2026-11-15/<branch>`.
- One FastAPI process on port 8000 serves `/market`, `/trading`, `/learning`, their WebSockets and the built frontend.
- A fresh clone runs `scripts/setup` then `scripts/demo` with no data download (committed 5 MB `data/runtime/`).
- Tests: backend 451 passed, 3 live-devnet skipped; frontend build and lint clean, 6/6 learning tests; Playwright smoke passes (also from a fresh clone).

See the final sections below for details, commands, decisions, risks and the TODO list.
