# Learning components (Person 4)

Mission UI for HoopStreet, built on Person 3's design system: `--hs-*` tokens,
`components/ui` (Button, Card, Pill, Tooltip) and the global `.label`, `.num` and
`.flash-*` classes from `index.css`. TypeScript, CSS Modules, no extra dependencies.

| file | what |
|---|---|
| `src/api/learning.ts` | REST client and typed models for `/learning/*`, exported from `src/api/index.ts` |
| `src/learning/hooks/useLearningSocket.ts` | `/learning/ws` with auto-reconnect; the same URL shares one socket |
| `src/learning/hooks/useMission.ts` | mission catalogue, status, result, start / stop / retry |
| `src/learning/*` | the components below |

## Mount

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
