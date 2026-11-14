# Learning sandbox (throwaway)

Test scaffolding for Person 4's components in `../frontend/src/components/learning`.
It uses the same TypeScript, ESLint and Inter setup as Person 3's frontend, and
imports their `index.css`, so the components look the way they will in the real
app. This is not part of the product, so don't build on it.

**Trading floor** (`http://localhost:5174/`) needs the dev backend running on
port 8001: run `python backend/learning/dev_app.py` from the repo root, with the
venv active. **Component states** (`?page=states`) uses fixtures and needs no
backend.

```bash
npm install     # first time only
npm run dev     # http://localhost:5174
npm run build   # tsc -b && vite build
npm run lint    # sandbox + the learning components
```

To point it at another backend: `VITE_LEARNING_API=http://host:port npm run dev`.
