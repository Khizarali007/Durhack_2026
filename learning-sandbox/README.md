# Learning sandbox (throwaway)

Test scaffolding for Person 4's components in `../frontend/src/learning`.
This is not part of the product, so don't build on it.

Needs the dev backend running on port 8001 (`python backend/learning/dev_app.py`
from the repo root, venv active). Then, in this folder:

```bash
npm install   # first time only
npm run dev   # http://localhost:5174
```

Point it at another backend with `VITE_LEARNING_API=http://host:port npm run dev`.
