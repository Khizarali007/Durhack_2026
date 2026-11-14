# Requests for Person 3 (from Person 4, learning layer)

> **Update (learn-mode branch):**
> - **Done on your side:** the amber warn token (`--hs-color-warn*`), the
>   `data-projector` attribute on `<html>`, `.sr-only` and `utils/format.ts`.
>   My code now uses all four.
> - **Still open:**
>   - Tooltip on keyboard focus.
>   - `className` / `aria-*` / `data-*` passthrough on `Button` and
>     `SegmentedControl`. Two tutorial targets need it; see
>     `docs/learn-mode-changes-to-person3-files.md`.
>   - The committed root `node_modules`.

My mission components now use your design system: your `--hs-*` tokens,
`components/ui`, `.label`, `.num` and `.flash-*`. They live in
`frontend/src/components/learning/`, plus `src/api/learning.ts`,
`src/hooks/useMission.ts` and `src/hooks/useLearningSocket.ts`. I copied your
`tokens.css`, `index.css`, `components/ui/*`, `useTheme.ts` and
`colorContrast.ts` byte for byte and haven't edited them. Everything below is
a suggestion: where I needed something you don't have yet, I built a local
workaround in my own files.

## 1. Tokens I'd like you to add

| Wanted | Why | What I use for now (`components/learning/tokens.module.css`) |
|---|---|---|
| `--hs-color-warning`, `--hs-color-warning-muted`, `--hs-color-warning-text` (amber) | "Weather watch" early-warning headlines, before an injury. Blue reads as "active / selected", not "watch out". Your margin warning state in P4 will need it too. | `--learn-watch` → `--hs-color-accent`, `--learn-watch-muted` → `--hs-color-accent-muted` |
| Optional: names for event meanings, `--hs-color-event-heat` and `--hs-color-event-storm` | Hot streak and injury headlines. Fine to keep them as up and down. | `--learn-heat` → `--hs-color-up-text` / `-up-muted`, `--learn-storm` → `--hs-color-down-text` / `-down-muted`, `--learn-calm` → `--hs-color-text-secondary` / `-neutral-muted` |

If you add the warning token, I'll switch `--learn-watch` to it. It's a
one-line change.

## 2. Projector mode

- My components grow when `data-projector="true"` is on any ancestor, or when
  they get a `projector` prop. Text moves one step up your
  `--hs-font-size-*` scale, and muted text becomes primary.
- **Please:** make your projector toggle set `data-projector="true"` on
  `<html>` (like `useTheme` does with `data-theme`). Then my components follow
  it with no wiring.
- If you'd rather implement projector mode as token overrides in `tokens.css`
  (e.g. `[data-projector="true"] { --hs-font-size-md: 16px; ... }`), tell me.
  Your Button and Pill would scale too, and I'd delete my local shift so
  nothing grows twice.

## 3. Small component API additions

- **Tooltip: open on keyboard focus.**
  - It only opens on `:hover` today, so keyboard users never see it.
  - Please add `.wrapper:focus-within .content { opacity: 1; visibility: visible; }`,
    and ideally `role="tooltip"` plus `aria-describedby`.
  - My `HelpTip` works around it with a structural selector
    (`.help:focus-within > span > span:last-child`). That breaks if Tooltip's
    markup changes, so tell me if it does.
- **Button: pass through `className` and `aria-*` props**
  (`aria-label`, `aria-expanded`, `aria-pressed`).
  - My icon-only "×" close button uses visually hidden text inside the
    children for now.
  - My "Need a hint?" toggle can't expose `aria-expanded`; it changes its
    label instead.
- **Card: pass through `aria-label` / `role`**, or an `as="section"` prop.
  - I wrap Card in a `<section aria-label>` for now.
- **A visually hidden utility class** (`.sr-only`) in `index.css`. I have my own
  in `tokens.module.css`.

## 4. Shared formatting helper

Your CLAUDE.md says money and percentages go through one helper. When
`src/utils/format.ts` (or similar) exists, I'll make
`components/learning/format.ts` (`formatPrice`, `formatHoop`, `formatPct`,
`formatClock`) delegate to it. Today mine formats with `en-GB`, 2 decimals,
and a real minus sign (U+2212) for negatives.

## 5. Mounting (when you're ready)

- **`/learn` (P6):**
  ```tsx
  const mission = useMission({ apiBase, userId })
  <MissionDebrief userId={userId} mission={mission} />
  <MissionPanel userId={userId} mission={mission} />
  ```
  Import from `../components/learning`. No CSS import needed: each component
  imports its own module CSS.
- **Home mission card (P1):** `useMission(...).missions`, `.passedIds` and
  `.nextMission` give you everything for a small "Mission 1: Buy low, sell
  high" card.
- **`userId`:** the same id Person 2's trading uses, or the grader won't see
  the trades.
- **`apiBase`:** `''` if `/learning` is same-origin. In dev, either point it at
  the backend or add a Vite proxy:
  `server.proxy: { '/learning': { target: 'http://localhost:8000', ws: true } }`.
  `ws: true` matters, because the mission feed is a WebSocket.
- **Navigation:** `MissionDebrief` takes `onRetry(result)` and
  `onNext(nextMission)`. Use them if a mission should also route somewhere,
  e.g. `/stock/SGA`.
- **Hands off:** don't use `/learning/mock/*`. It exists only for my sandbox.

## 6. Things I noticed (no action needed unless you agree)

- **Root `node_modules/` is committed** on `frontend`: 301 files (react,
  react-router, lightweight-charts, ...), plus a root `package.json` and
  `package-lock.json`.
  - It looks like an `npm install` run at the repo root instead of in
    `frontend/`.
  - A test merge with my branch goes through cleanly, but it would bring all
    of that into `main`.
  - Suggested fix: `git rm -r --cached node_modules package.json package-lock.json`
    at the root. My branch's root `.gitignore` already ignores `node_modules`.
- **`.claude/settings.local.json` is committed.** It holds machine-specific
  paths and is usually kept out of git.
- **`useTheme`:** it reads and writes `localStorage` without try/catch. Some
  private-browsing modes throw there and would blank the app. Worth wrapping.
- **Mobile vs laptop-only:** `CLAUDE.md` says laptop-only, while
  `person3-pages.md` still lists 375px mobile checks. My components are fluid
  and work at both, so either way is fine for me.
- **Reduced motion:** `.flash-up` / `.flash-down` have no
  `prefers-reduced-motion` guard. It's a 200ms colour fade, so it's
  low-risk.

## Review

The sandbox has a **Component states** tab that shows every learning
component in every state (idle, running with hints, hot-streak alert, last 10
seconds, passed, failed, stopped, locked, backend down, projector). Dark and
light themes are side by side, using fixture data, so no backend is needed:

```bash
cd learning-sandbox && npm install && npm run dev
# open http://localhost:5174/?page=states
```
