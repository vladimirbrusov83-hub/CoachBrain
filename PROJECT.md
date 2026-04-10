# CoachBrain — TypeScript Library Documentation

## Overview
Pure TypeScript library that takes an athlete's session history and returns coaching decisions: increase weight / hold / deload, and by how much. No UI, no database, no external dependencies.

- **GitHub:** https://github.com/vladimirbrusov83-hub/CoachBrain
- **Local:** `/Users/brusov/Documents/CoachBrain/`
- **Not deployed** — library used by TrueCoachProject and planned IronLog iOS app

---

## File Structure

```
CoachBrain/
├── src/
│   ├── index.ts        ← public API — import from here only
│   ├── types.ts        ← all TypeScript interfaces
│   ├── suggestions.ts  ← getCoachDecision() — main orchestrator (Rule 5)
│   ├── progression.ts  ← getProgressionDecision() — increase/hold logic (Rules 1–2)
│   ├── deload.ts       ← getDeloadStatus(), deload plan, reload weight (Rule 3)
│   ├── warmup.ts       ← getWarmupSets() — warmup ladder generator (Rule 4)
│   └── utils.ts        ← shared helpers (avgRIR, detectPhase, classifyLift, etc.)
├── tests/
│   ├── progression.test.ts
│   ├── deload.test.ts
│   ├── suggestions.test.ts
│   └── warmup.test.ts
├── scripts/
│   └── analyze-logs.py  ← Python script used to derive rules from athlete logs
├── METHODOLOGY.md       ← how the rules were derived from real data
├── tsconfig.json
└── vitest.config.ts
```

---

## Public API

All exports via `src/index.ts`:

```typescript
import { getCoachDecision } from 'coachbrain';
import type { AthleteHistory } from 'coachbrain';
```

### `getCoachDecision(history, exerciseName)` → `CoachDecision`
Main function. Orchestrates all modules and returns a complete decision.

### `getProgressionDecision(history, exerciseName)` → `ProgressionDecision`
Raw progression logic only (increase/hold/deload/reload/insufficient_data).

### `getDeloadStatus(history)` → `{ deloadWarning, deloadTriggered, reason }`
Checks if a deload is needed based on RIR trends.

### `getWarmupSets(workingWeight, exerciseName)` → `WorkingSet[]`
Returns a warmup ladder for the given lift type and working weight.

---

## Core Types (`src/types.ts`)

### Input types

```typescript
interface WorkingSet {
  weight: number;        // lbs
  reps: number;
  rir?: number;          // 0–10; undefined if not logged
  rpe?: number;          // alternative to RIR
  effortScore?: number;  // X/10 scale (some clients)
}

interface ExerciseEntry {
  name: string;          // e.g. "BB bench press"
  sets: WorkingSet[];
  coachNote?: string;
  isWarmup?: boolean;    // exclude warmup sets from decisions
}

interface Session {
  date: string;          // ISO 8601 "YYYY-MM-DD"
  status: 'completed' | 'missed';
  exercises: ExerciseEntry[];
  isDeload?: boolean;
  sessionTitle?: string; // "Day 1", "Upper A", etc.
}

interface AthleteHistory {
  sessions: Session[];
  lastDeloadDate?: string;  // ISO date of last deload
}
```

### Output types

```typescript
type ProgressionAction = 'increase' | 'hold' | 'deload' | 'reload' | 'insufficient_data';
type TrainingPhase = 'early' | 'mid' | 'late' | 'deload' | 'reload' | 'unknown';

interface CoachDecision {
  exercise: string;
  phase: TrainingPhase;
  sessionsSinceDeload: number;
  lastSession: {
    date: string;
    weight: number;
    sets: number;
    reps: number;           // average across sets
    avgRIR: number | null;
    status: 'completed' | 'missed';
  };
  nextSession: {
    warmupSets: WorkingSet[];
    workingSets: WorkingSet[];
    suggestedSets: number;
    suggestedReps: number;
  };
  progression: {
    action: ProgressionAction;
    suggestedWeight: number;  // lbs, rounded to nearest 5
    increment: number;        // 0, 2.5, 5, or 10
    confidence: 'high' | 'medium' | 'low';
    reason: string;           // plain English explanation
  };
  deloadWarning: boolean;    // fatigue accumulating — monitor
  deloadTriggered: boolean;  // deload now
}
```

---

## The Five Rules (derived from real athlete data)

### Rule 1 — Progression trigger (all must be true)
- ≥ 2 consecutive completed sessions
- Average RIR across last 2 sessions ≤ 2.0
- Last session RIR ≠ 0
- Not currently deloading
- Action: `increase`

### Rule 2 — Hold conditions (any one triggers hold)
- Last session was missed
- Last session hit RIR = 0 (failure)
- Average RIR ≥ 3.0 (too much in the tank — build consistency first)
- Currently in deload week
- Action: `hold`

### Rule 3 — Deload detection (reactive, not calendar-based)
- Minimum 8 sessions since last deload before warning can fire
- Deload **warning**: last 3 session avg RIR between 1.3–1.6
- Deload **triggered**: avg RIR below 1.3 OR any session at RIR = 0 while in late phase
- Key finding: calendar-based deloads don't match real data — Athlete A ranged from 6–11 sessions between deloads

### Rule 4 — Warmup protocol
Lift classification → warmup category:
- **Compound** (squat, bench, deadlift, OHP, rows): full ladder → bar×12, 50%×5, 70%×3, 85%×2, working sets
- **Isolation/machine**: 2 lighter warmup sets only
- **Bodyweight** (pull-ups, dips): no warmup sets — first set IS the warmup

### Rule 5 — Decision assembly (`suggestions.ts`)
`getCoachDecision()` orchestrates Rules 1–4:
1. Call `getProgressionDecision()` → get action + suggested weight
2. Call `getDeloadStatus()` → get warning/triggered flags
3. Pull last session summary
4. Build warmup ladder at suggested weight
5. Build working sets (same structure as last session, new weight)
6. Detect training phase and sessions since deload
7. Return complete `CoachDecision`

---

## Increment Table

Derived from data (Finding 3 in METHODOLOGY.md):

| Lift Type | Phase | Increment |
|-----------|-------|-----------|
| Barbell upper | early/mid | +10 lbs |
| Barbell upper | late | +5 lbs |
| Barbell lower | all | +10 lbs |
| Dumbbell | all | +5 lbs |
| Machine | all | +5 lbs |

If last session's avg RIR = 1 exactly → reduce increment by one step (safety margin at the edge).

Weights rounded to nearest 5 lbs.

---

## Training Phases

Phases are determined by sessions since last deload:
- **early**: 0–4 sessions — larger increments tolerated
- **mid**: 5–8 sessions
- **late**: 9+ sessions — more conservative increments
- **deload**: currently in deload week
- **reload**: 1–4 sessions after a deload (separate from early)

If RIR trend is declining across last 3 sessions → phase shifts one step later (more conservative).

---

## Dataset & Methodology

Rules derived from 3 anonymized athletes, Sep 2024 – Apr 2025:
- **Athlete A**: 74 sessions, 95.7% adherence, avg RIR 1.48 — primary RIR dataset
- **Athlete B**: 37 sessions — validated increment sizes and phase structure
- **Athlete C**: 90 sessions, 49 deload sessions — validated deload timing

Key findings (full details in `METHODOLOGY.md`):
- RIR 2 is the natural center of gravity for productive training (42.3% of all sets)
- Deloads are reactive (6–11 sessions apart), never calendar-based
- Upper barbell absorbs +10 early/mid but not late phase
- Weight resets are normal — not failure signals

---

## Development

```bash
npm run build      # compile TypeScript → dist/
npm test           # run vitest test suite
npm run typecheck  # type-check without emitting
```

Tests: `tests/progression.test.ts`, `deload.test.ts`, `suggestions.test.ts`, `warmup.test.ts`

---

## Bigger Picture

CoachBrain is the logic layer for two tools:
1. **TrueCoachProject** (`/Users/brusov/Documents/TrueCoachProject/`) — the local Node/Express workflow tool (see its PROJECT.md). Currently uses its own inline progression rules via Groq, not this library directly, but CoachBrain is the algorithmic source of truth.
2. **IronLog** — planned SwiftUI iOS app (not yet built) that reads TrueCoach session history and surfaces CoachBrain decisions in the athlete's training interface.
