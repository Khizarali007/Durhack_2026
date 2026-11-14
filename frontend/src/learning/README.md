# Learning layer (Person 4)

Mission UI for HoopStreet, built on Person 3's design system: `--hs-*` tokens,
`components/ui` (Button, Card, Pill, Tooltip) and the global `.label`, `.num` and
`.flash-*` classes from `index.css`. TypeScript, CSS Modules, no extra dependencies.

| file | what |
|---|---|
| `src/api/learning.ts` | REST client and typed models for `/learning/*`, exported from `src/api/index.ts` |
| `src/learning/hooks/useLearningSocket.ts` | `/learning/ws` with auto-reconnect; the same URL shares one socket |
| `src/learning/hooks/useMission.ts` | mission catalogue, status, result, start / stop / retry |
| `src/learning/*` | the components below |

## Learn mode (guided tutorials)

| path | what |
|---|---|
| `tour/tutorials/*.ts` | one file per tutorial: steps with a route, a `data-tour` target, short copy and how the step completes |
| `tour/TourOverlay.tsx` | the coach overlay, mounted once in `App.tsx` |
| `tour/store.ts` | progress (localStorage `hs-learn-tour-v1`), Start / Resume / Restart / Exit, and the fills and headlines seen during a run |
| `learn/LearnMode.tsx` | the `/learn` page: Start here, tutorial cards, glossary, graded challenges |
| `learn/TourPromptCard.tsx` | the Home page invitation (in Home's mission-card mount) |
| `glossary/GlossaryTerm.tsx` | a "?" tooltip for any term in `content/glossary.json` (not placed yet: Person 3 decides where) |
| `content/` | imports `content/glossary.json` and `content/missions.json` from the repo root, the single source of copy |

**Adding a tutorial:**
1. Write `tour/tutorials/<name>.ts` and add it to `TUTORIALS` in `tour/tutorials/index.ts`.
2. If a step needs an element without a `data-tour` attribute, add one to Person 3's
   file and log it in `docs/learn-mode-changes-to-person3-files.md`.

Step completion types:
- `next`, `click`, `navigate`, `input` (a field holds a value)
- `order_filled` (side and symbol, optional fill reason)
- `event` (kind and symbol, optional `moment` from `src/api/tutorialDirector.ts`)

The fallback copy shows when no director is available, i.e. on the real backend.

## Mount (graded missions)

```tsx
import { MissionDebrief, MissionPanel, useMission } from '../learning'

export default function LearnPage({ userId }: { userId: string }) {
  const apiBase = '' // same origin: the Vite proxy sends /learning to :8001
  const mission = useMission({ apiBase, userId }) // one connection for both
  return (
    <>
      <MissionDebrief userId={userId} mission={mission} />
      <MissionPanel userId={userId} mission={mission} />
    </>
  )
}
```

No stylesheet import is needed: every component imports its own
`*.module.css`. The app's `index.css` must already be loaded (it is, in
`main.tsx`). Both components also work on their own:
`<MissionPanel userId={id} apiBase={base} />`.

## Components

| export | what | props |
|---|---|---|
| `MissionPanel` | mission list (locked ones greyed), active mission card: title, goal, countdown, "Need a hint?", coach's tips, live feed with weather-style headlines, Start / Stop | `userId`*, `apiBase`, `mission`, `projector`, `className` |
| `MissionDebrief` | shows when a mission ends: pass / fail, 0-100 score, bought / sold vs best possible, debrief, lesson, Retry / Next. Renders nothing otherwise | `userId`*, `apiBase`, `mission`, `onRetry(result)`, `onNext(nextMission)`, `dismissible`, `projector`, `className` |
| `MissionDebriefView` | pure debrief for one result object | `result`*, `entry`, `nextMission`, `busy`, `onRetry`, `onNext`, `onClose`, `projector`, `className` |
| `MissionList`, `FeedItem` | building blocks used by the panel | see source |
| `ScoreRing`, `HelpTip` | score ring; a keyboard-focusable "?" around `ui/Tooltip` | see source |
| `useMission({ apiBase, userId })` | returns a `MissionHandle` | |

`onRetry` / `onNext` default to starting the mission over the API. Override
them if a mission should also navigate (e.g. to `/stock/SGA`).

## Theming

- Colours come only from `--hs-*` tokens, so `useTheme()` (which sets
  `data-theme` on `<html>`) restyles everything automatically.
- Missing meanings (hot streak "heat", early-warning "watch") are local aliases
  in `tokens.module.css` that map to existing tokens. They're listed in
  `docs/person4-requests-for-person3.md`.
- Projector: pass `projector`, or put `data-projector="true"` on any ancestor.
  Text moves one step up the `--hs-font-size-*` scale and muted text becomes
  primary.

## Accessibility

- Visible focus rings (from `ui/Button`, and the same 2px accent outline on
  mission rows and "?" buttons).
- The mission feed and coach's tips are `aria-live="polite"`. The timer is
  `role="timer"`, with a separate polite live region that only announces at
  30 s, 10 s and the bell, so screen readers aren't spammed every second.
- `HelpTip` opens Person 3's Tooltip on keyboard focus too, and puts the
  explanation in the button's accessible name.
