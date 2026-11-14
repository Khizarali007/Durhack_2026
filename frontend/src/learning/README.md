# Learning components (Person 4)

Mission UI for HoopStreet. Plain React (18 or 19) and one stylesheet. No
router, state library or CSS framework. Every class is prefixed `hs-learn-`.

## Mount

```jsx
import { MissionPanel, MissionDebrief, useMission } from './learning';
import './learning/learning.css'; // once, anywhere

function LearnPage({ userId }) {
  const apiBase = 'http://localhost:8001'; // or '' when /learning is same-origin / proxied
  const mission = useMission({ apiBase, userId }); // optional: share one connection
  return (
    <>
      <MissionDebrief userId={userId} mission={mission} />
      <MissionPanel userId={userId} mission={mission} />
    </>
  );
}
```

Both components also work on their own:
`<MissionPanel userId={id} apiBase={base} />`.

## Components

| export | what | props |
|---|---|---|
| `MissionPanel` | mission list (locked ones greyed), active mission: title, goal, countdown, "Need a hint?", scheduled hints, live feed with weather-alert headlines, Start/Stop | `userId`*, `apiBase`, `mission`, `className` |
| `MissionDebrief` | shows when a mission ends: pass/fail, 0-100 score, bought/sold vs best possible, debrief, lesson, Retry/Next. Renders nothing otherwise | `userId`*, `apiBase`, `mission`, `onRetry(result)`, `onNext(nextMission)`, `dismissible`, `className` |
| `MissionDebriefView` | pure debrief view for a result object | `result`*, `entry`, `nextMission`, `busy`, `onRetry`, `onNext`, `onClose` |
| `MissionList`, `FeedItem` | building blocks used by the panel | see source |
| `useMission({ apiBase, userId })` | mission catalogue, status, result, `start(id)`, `stop()`, `retry()`, `connection` | |
| `useLearningSocket({ apiBase, userId, symbols, onMessage })` | `/learning/ws` with auto-reconnect; same URL shares one socket | returns `{ status, connected }` |
| `createLearningApi(apiBase)` | REST client for `/learning/*` | |

`onRetry` / `onNext` default to starting the mission over the API. Override them if
a mission should also navigate (e.g. to `/stock/SGA`).

## Theming

- Dark by default. Light: put `data-theme="light"` on any ancestor.
- Projector: `data-projector="true"` on any ancestor (or class `hs-learn--projector`).
- Everything is driven by `--hs-learn-*` custom properties on `.hs-learn`.
  Override them to match the app tokens.
- All sizes are in `em`, so `--hs-learn-font-size` scales a whole component.
