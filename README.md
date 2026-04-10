# CoachBrain

**Progressive overload decisions from 20 years of real coaching data.**

Every fitness algorithm on GitHub was written by a developer. CoachBrain was written by a coach — and validated against actual athlete logs, not textbook theory.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](#testing)

---

## What It Is

CoachBrain is a pure TypeScript library. Give it an athlete's session history. Get back a complete coaching decision:

- Should this athlete increase weight, hold, or deload?
- By exactly how much?
- What's their warmup protocol for next session?
- Is fatigue accumulating — how close are they to needing a deload?

No UI. No database. No external dependencies. Input sessions in, get structured decisions out.

```typescript
import { getCoachDecision } from 'coachbrain';

const decision = getCoachDecision(history, 'BB bench press');

console.log(decision.progression.action);          // 'increase'
console.log(decision.progression.suggestedWeight); // 205
console.log(decision.progression.reason);          // '2 consecutive sessions at avg 1.8 RIR...'
console.log(decision.deloadWarning);               // false
console.log(decision.nextSession.warmupSets);      // [{ weight: 45, reps: 10 }, ...]
```

---

## The Problem With Existing Algorithms

Standard fitness app algorithms apply fixed rules: "add 5 lbs when you hit 3×8," "deload every 4–6 weeks." These rules come from textbooks. They fail against real data for three reasons:

1. **Deload timing is reactive, not calendar-based.** Real athletes go 6 sessions between deloads and sometimes 11. A fixed 4-week rule fires too early half the time and too late the other half.

2. **Progression increments are phase-dependent.** An athlete four sessions out of a deload absorbs a +10 lb jump on bench press without issue. The same athlete at session eleven in the same block cannot — RIR drops sharply. The algorithm needs to know where in the block it is.

3. **RIR = 0 is a hard stop.** Eight percent of all real working sets reach failure. Triggering a weight increase after a failure session is a mistake that compounds into injury. Most algorithms don't account for this at all.

CoachBrain's rules were extracted from annotated coaching logs using data analysis. Every threshold corresponds to a pattern that appeared consistently across real athletes over multiple training blocks. See [METHODOLOGY.md](METHODOLOGY.md) for the full derivation.

---

## Install

```bash
npm install coachbrain
```

Or build locally:

```bash
git clone https://github.com/vladimirbrusov83-hub/CoachBrain
cd CoachBrain
npm install
npm run build
```

---

## Quick Start

```typescript
import { getCoachDecision } from 'coachbrain';
import type { AthleteHistory } from 'coachbrain';

const history: AthleteHistory = {
  lastDeloadDate: '2024-09-30',
  sessions: [
    {
      date: '2024-10-07',
      status: 'completed',
      exercises: [{
        name: 'BB bench press',
        sets: [
          { weight: 195, reps: 8, rir: 3 },
          { weight: 195, reps: 8, rir: 2 },
          { weight: 195, reps: 8, rir: 2 },
        ],
      }],
    },
    {
      date: '2024-10-14',
      status: 'completed',
      exercises: [{
        name: 'BB bench press',
        sets: [
          { weight: 195, reps: 8, rir: 2 },
          { weight: 195, reps: 8, rir: 2 },
          { weight: 195, reps: 8, rir: 1 },
        ],
      }],
    },
  ],
};

const decision = getCoachDecision(history, 'BB bench press');
```

---

## API Reference

### `getCoachDecision(history, exerciseName)` → `CoachDecision`

The main function. Orchestrates all five rules and returns a complete recommendation for one exercise.

```typescript
function getCoachDecision(
  history: AthleteHistory,
  exerciseName: string
): CoachDecision
```

### `getProgressionDecision(history, exerciseName)` → `ProgressionDecision`

The progression engine only — increase/hold/deload/reload/insufficient_data. Use this if you don't need warmup sets or deload assessment.

### `getDeloadStatus(history)` → `DeloadStatus`

Checks the full session history for fatigue accumulation. Returns `deloadWarning` and `deloadTriggered` flags with reasons.

### `getWarmupSets(workingWeight, exerciseName)` → `WorkingSet[]`

Generates a warmup ladder appropriate for the lift type and working weight.

---

## Input Types

```typescript
interface AthleteHistory {
  sessions: Session[];
  lastDeloadDate?: string;  // ISO date — used to count training phase
}

interface Session {
  date: string;             // ISO 8601, e.g. "2024-10-14"
  status: 'completed' | 'missed';
  exercises: ExerciseEntry[];
  isDeload?: boolean;       // flag deload sessions explicitly
  sessionTitle?: string;    // "Day 1", "Upper A", etc.
}

interface ExerciseEntry {
  name: string;             // e.g. "BB bench press", "Leg Press", "Cable Row"
  sets: WorkingSet[];
  isWarmup?: boolean;       // true = exclude from progression decisions
  coachNote?: string;       // inline coaching note
}

interface WorkingSet {
  weight: number;           // lbs
  reps: number;
  rir?: number;             // Reps In Reserve, 0–10
  rpe?: number;             // Rate of Perceived Exertion, 0–10
  effortScore?: number;     // X/10 scale (alternative to RIR for some athletes)
}
```

---

## Output: `CoachDecision`

```typescript
interface CoachDecision {
  exercise: string;

  // Training context
  phase: 'early' | 'mid' | 'late' | 'deload' | 'reload' | 'unknown';
  sessionsSinceDeload: number;

  // What happened last session
  lastSession: {
    date: string;
    weight: number;           // highest weight logged
    sets: number;
    reps: number;             // average across sets
    avgRIR: number | null;    // null if no RIR was recorded
    status: 'completed' | 'missed';
  };

  // What to do next session
  nextSession: {
    warmupSets: WorkingSet[];   // progressive warmup ladder
    workingSets: WorkingSet[];  // same structure as last session, new weight applied
    suggestedSets: number;
    suggestedReps: number;
  };

  // The core decision
  progression: {
    action: 'increase' | 'hold' | 'deload' | 'reload' | 'insufficient_data';
    suggestedWeight: number;  // lbs, rounded to nearest 5
    increment: number;        // 0, 2.5, 5, or 10
    confidence: 'high' | 'medium' | 'low';
    reason: string;           // plain English explanation of the decision
  };

  deloadWarning: boolean;     // true: fatigue accumulating, watch closely
  deloadTriggered: boolean;   // true: deload this week
}
```

---

## The Five Rules

### Rule 1 — Progression Trigger

Weight increases when **all** of these are true:
- At least 2 consecutive completed sessions for this exercise
- Average RIR across the last 2 sessions ≤ 2.0
- Last session's RIR was not 0 (not failure)
- Not currently in a deload

Action: `increase`. Increment size depends on lift type and training phase (see Rule 1a below).

### Rule 1a — Increment Sizes

Derived from phase analysis across three athletes (Finding 3 in METHODOLOGY.md):

| Lift Type | Early Phase (0–4 sessions) | Mid Phase (5–8) | Late Phase (9+) |
|-----------|---------------------------|-----------------|-----------------|
| Barbell — upper body | **+10 lbs** | **+10 lbs** | +5 lbs |
| Barbell — lower body | **+10 lbs** | **+10 lbs** | **+10 lbs** |
| Dumbbell | +5 lbs | +5 lbs | +5 lbs |
| Machine / cable | +5 lbs | +5 lbs | +5 lbs |

If the last session's avg RIR was exactly 1 — the athlete is near the edge — the increment reduces by one step (10 → 5, 5 → 2.5).

All suggested weights round to the nearest 5 lbs.

### Rule 2 — Hold Conditions

Weight stays the same when **any** of these are true:
- Last session was missed (repeat the weight before progressing)
- Last session hit RIR = 0 (athlete reached failure — consolidate before loading)
- Average RIR across last 2 sessions ≥ 3.0 (load isn't challenging enough to warrant an increase)
- Currently in a deload week

### Rule 3 — Deload Detection

**Calendar-based deloads don't match real data.** Athlete C logged 49 deload sessions across a 90-session training history — the spacing ranged from 6 to 11 sessions. CoachBrain uses RIR thresholds, not a week counter.

Minimum 8 sessions since last deload before any deload signal can fire.

**Warning** (deloadWarning = true): average RIR across last 3 sessions < 1.5 **and** at least one session included a failure set (RIR = 0), with 8+ sessions elapsed.

**Trigger** (deloadTriggered = true): either the warning has persisted for 2+ consecutive sessions, or overall average RIR drops below 1.0.

### Rule 4 — Warmup Protocol

Exercises are classified into three warmup categories:

**Compound** (squat, bench press, deadlift, OHP, rows, RDL, incline press, close-grip bench):

| Set | Load | Reps |
|-----|------|------|
| 1 | Bar (45 lbs) | 10 |
| 2 | 40% of working weight | 8 |
| 3 | 60% | 5 |
| 4 | 75% | 3 — skipped if working weight < 95 lbs |
| 5 | 85% | 2 — skipped if working weight < 135 lbs |

**Isolation / machine**: 2 sets at 50% × 12 and 70% × 8.

**Bodyweight** (pull-ups, dips, push-ups): no warmup sets — first working set serves as warmup.

### Rule 5 — Decision Assembly

`getCoachDecision()` in `src/suggestions.ts` runs in this order:
1. Call `getProgressionDecision()` → action and suggested weight
2. Call `getDeloadStatus()` → warning and triggered flags
3. Pull last session summary from history
4. Build warmup ladder at suggested weight
5. Build working sets (same set/rep structure as last session, new weight applied)
6. Detect training phase and sessions since deload
7. Return the complete `CoachDecision`

---

## Training Phases

| Phase | Sessions Since Deload | Effect |
|-------|-----------------------|--------|
| `early` | 0–4 | Larger increments tolerated — athlete is fresh post-deload |
| `mid` | 5–8 | Standard increments |
| `late` | 9+ | Conservative increments — fatigue accumulating |
| `reload` | First 4 sessions after a deload | Recovery-focused, similar to early |
| `deload` | (during deload week) | Hold weight, focus on technique |

If RIR trend is declining across the last 3 sessions, the phase shifts one step later (more conservative increments).

---

## Module Architecture

```
src/
├── index.ts        Public API — import from here, not from individual modules
├── types.ts        All TypeScript interfaces (AthleteHistory → CoachDecision)
├── suggestions.ts  Rule 5: getCoachDecision() — orchestrates all other modules
├── progression.ts  Rules 1–2: increase/hold decisions, increment sizing, phase adjustment
├── deload.ts       Rule 3: deload detection (warning and trigger thresholds)
├── warmup.ts       Rule 4: warmup ladder generation by lift category
└── utils.ts        Shared helpers: avgRIR, sessionsSinceDeload, detectPhase, classifyLift, roundToNearest5
```

`suggestions.ts` is the only module that calls others. All other modules are self-contained. If you only need progression decisions, import `getProgressionDecision` directly and ignore the rest.

---

## Testing

```bash
npm test           # run full test suite (vitest)
npm run test:watch # watch mode
npm run typecheck  # type-check without emitting
```

Test files mirror the source modules:
- `tests/progression.test.ts` — increase/hold logic, edge cases (RIR = 0, missed sessions, insufficient data)
- `tests/deload.test.ts` — deload warning and trigger conditions, minimum session guard
- `tests/suggestions.test.ts` — full decision assembly, nextSession structure
- `tests/warmup.test.ts` — warmup ladder generation by lift type and weight range

---

## Methodology

The rules were derived from annotated coaching logs covering three athletes (anonymized A, B, C) over September 2024 – April 2025. Key dataset facts:

- **Athlete A:** 74 sessions, 95.7% adherence, avg RIR 1.48. Primary source for RIR-based progression thresholds. Dense inline RIR data on nearly every set.
- **Athlete B:** 37 sessions. Validated increment sizes and phase structure in a no-RIR-logging context.
- **Athlete C:** 90 sessions, avg RIR 2.09. 49 deload sessions in the record — the primary source for deload timing validation.

**RIR distribution across all of Athlete A's working sets:**

| RIR | Count | % of Sets |
|-----|-------|-----------|
| 0 | 38 | 8.1% |
| 1 | 112 | 23.9% |
| 2 | 198 | 42.3% |
| 3 | 89 | 19.0% |
| 4 | 22 | 4.7% |
| 5+ | 9 | 1.9% |

RIR 2 is the natural center of gravity — the 2.0 average threshold for the progression trigger maps directly to where a well-managed athlete operates. The methodology document covers all three key findings in full: [METHODOLOGY.md](METHODOLOGY.md)

---

## What CoachBrain Is Not

- **Not a full app.** There's no UI, no data storage, no platform integration. It's a logic layer — connect your data model to it.
- **Not an LLM.** All decisions are deterministic and explainable. Every output includes a `reason` string showing exactly which rule fired and why.
- **Not one-size-fits-all.** The rules were derived from barbell athletes using RIR notation. Athletes who don't log RIR will get `confidence: 'low'` responses. The X/10 effort scale is supported as `effortScore` on `WorkingSet`.

---

## Built On Top of CoachBrain

**TrueCoach Workflow Automation** — A local Node/Express tool (private) that processes TrueCoach client session logs, generates next-session prescriptions via Groq AI, and outputs paste-ready workout text. CoachBrain is the decision-logic layer. Reduces weekly programming time from ~2 hours to ~15 minutes across a 15-client roster.

**IronLog** *(in development)* — A SwiftUI iOS app that reads TrueCoach session history and surfaces coaching decisions directly inside the athlete's training interface. CoachBrain handles all progression logic; IronLog handles UI and TrueCoach data sync.

---

## License

MIT — use it, build on it, adapt it.

---

*Built by a coach. Validated against real training data. Not theoretical.*
