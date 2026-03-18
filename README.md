# CoachBrain

Every fitness app on GitHub was built by a developer. CoachBrain was built by a coach — from 20 years of real training data.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](#)

---

## What it is

CoachBrain is a pure TypeScript library that takes an athlete's session history and returns coaching decisions: whether to increase weight, hold, or deload — and by how much. No UI. No database. No external dependencies. Input sessions in, get structured decisions out.

## The problem it solves

Progressive overload algorithms in existing fitness apps are derived from textbooks. They apply fixed rules ("add 5 lbs when you hit 3x8") without accounting for real-world training patterns: accumulated fatigue, training phase, equipment type, or the gap between prescribed and actual effort. CoachBrain's rules were extracted directly from annotated coaching logs using data analysis — every threshold corresponds to a pattern observed across real athletes.

## Who it's for

Developers building coaching tools, workout apps, or training automation workflows. CoachBrain is the logic layer — connect your data model to it and get decisions back.

---

## Install

```bash
npm install coachbrain
```

Or clone and build locally:

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

// Build session history — in production this comes from your database
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

// Get a complete coaching decision for one exercise
const decision = getCoachDecision(history, 'BB bench press');

console.log(decision.progression.action);          // 'increase'
console.log(decision.progression.suggestedWeight); // 205
console.log(decision.progression.reason);          // '2 consecutive sessions at avg 1.8 RIR...'
console.log(decision.deloadWarning);               // false
console.log(decision.nextSession.warmupSets);      // [{ weight: 45, reps: 10 }, ...]
```

---

## What It Returns

`getCoachDecision()` returns a `CoachDecision` object:

```typescript
{
  exercise: string;              // exercise name as passed in

  phase: TrainingPhase;          // 'early' | 'mid' | 'late' | 'deload' | 'reload' | 'unknown'
                                 // based on sessions since last deload

  sessionsSinceDeload: number;   // count of completed, non-deload sessions since lastDeloadDate

  lastSession: {
    date: string;                // ISO date of last completed session with this exercise
    weight: number;              // highest weight used
    sets: number;
    reps: number;                // average reps across sets
    avgRIR: number | null;       // null if no RIR was logged
    status: SessionStatus;       // 'completed' | 'missed'
  };

  nextSession: {
    warmupSets: WorkingSet[];    // progressive warm-up ladder (compound) or 2 sets (isolation)
    workingSets: WorkingSet[];   // working sets with suggestedWeight applied
    suggestedSets: number;
    suggestedReps: number;
  };

  progression: {
    action: ProgressionAction;   // 'increase' | 'hold' | 'deload' | 'reload' | 'insufficient_data'
    suggestedWeight: number;     // in lbs, rounded to nearest 5
    increment: number;           // 0, 2.5, 5, or 10
    confidence: 'high' | 'medium' | 'low';
    reason: string;              // plain English explanation
  };

  deloadWarning: boolean;        // true: fatigue accumulating, monitor closely
  deloadTriggered: boolean;      // true: deload now
}
```

---

## How the Rules Were Derived

The five core rules (progression trigger, hold conditions, deload detection, warm-up protocol, decision assembly) were extracted from annotated coaching logs covering three athletes over seven months, using inline RIR data and coach notes as ground truth. See [METHODOLOGY.md](METHODOLOGY.md) for the full analysis.

---

## Bigger Picture

CoachBrain is the logic layer behind two tools in active development:

**IronLog** — a SwiftUI iOS app that reads TrueCoach session history and surfaces coaching decisions directly in the athlete's training interface. CoachBrain handles all the decision logic; IronLog handles UI and data sync.

**TrueCoach Workflow Automation** — a Node/Express tool that processes TrueCoach JSONL exports, runs them through CoachBrain, and generates next-session prescriptions in the coach's preferred format. Reduces programming time from ~2 hours/week to ~15 minutes.

The TypeScript library is the open-source core. Both applications are built on top of it.

---

## License

MIT
