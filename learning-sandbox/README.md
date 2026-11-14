# Learning sandbox (throwaway)

Kept for one reason: the **Component states** gallery (`?page=states`). It shows
every mission component state (idle, running with hints, hot-streak alert, last
10 seconds, passed, failed, stopped, locked, backend down, projector) in dark
and light side by side, using fixtures, so Person 3 can review them without a
backend. The real app has no route for that, and adding one would mean
another edit to his `App.tsx`.

Everything else the sandbox used to show (playing Mission 1 live) now works in
the real app: `/learn` → Challenges, with the learning server running.

The components live in `../frontend/src/learning`. This app imports them through
the `@` alias, together with Person 3's `index.css` and `components/ui`.

```bash
npm install     # first time only
npm run dev     # http://localhost:5174/?page=states
npm run build   # tsc -b && vite build
npm run lint
```

The **Trading floor** tab (`/`) also still works. It needs the learning dev server on
port 8001 (`python backend/learning/dev_app.py` from the repo root, venv active).
