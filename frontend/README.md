# HoopStreet frontend

React/TypeScript interface for the historical NBA player-market backend.
The real backend is used by default. See ../docs/season-integration.md for setup,
source-branch provenance, supported gameplay and model limitations.

```sh
npm ci
VITE_API_TARGET=http://127.0.0.1:8002 npm run dev -- --host 127.0.0.1
```

Start the backend separately with the command in the run guide. Open port 5173.
Production checks: `npm run build` and `npm run lint`.
Mock mode is explicit: `VITE_USE_MOCKS=true`; it is not the integrated demo.
