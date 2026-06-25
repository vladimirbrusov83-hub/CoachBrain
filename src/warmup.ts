// src/warmup.ts
// Rule 4: Generate appropriate warm-up sets based on lift type and working weight
// Warm-up protocol is derived from standard conjugate/linear progresssion practice,
// calibrated against Athlete A's logged warm-up patterns.

import { WorkingSet } from './types';
import { roundToNearest5 } from './utils';

type WarmupCategory = 'compound' | 'isolation' | 'bodyweight';

// Classify exercise into warm-up category
function getWarmupCategory(exerciseName: string): WarmupCategory {
  const name = exerciseName.toLowerCase();

  // Bodyweight: no added weight, first working set IS the warm-up
  if (
    /\bpull.?up/.test(name) ||
    /\bdips?\b/.test(name) ||
    /\bpush.?up/.test(name) ||
    (/\bhyperextension\b/.test(name) && !/\bbar\b/.test(name) && !/\blb/.test(name))
  ) {
    return 'bodyweight';
  }

  // Compound: bilateral barbell movements — require full warm-up ladder
  if (
    /\bsquat\b/.test(name) ||
    /\bbench press\b/.test(name) ||
    /\bdeadlift\b/.test(name) ||
    /\bdl\b/.test(name) ||
    /trap bar/.test(name) ||
    /\brdl\b/.test(name) ||
    /romanian/.test(name) ||
    /overhead press/.test(name) ||
    /\bohp\b/.test(name) ||
    /military press/.test(name) ||
    /barbell row/.test(name) ||
    /\bbb row\b/.test(name) ||
    /incline press/.test(name) ||
    /split squat.*bar/.test(name) ||
    /\bclose grip bench\b/.test(name) ||
    /\bcgbp\b/.test(name)
  ) {
    return 'compound';
  }

  // Isolation / machine: shorter warm-up (2 sets)
  return 'isolation';
}

// Build the compound warm-up ladder (weights in kg).
// Set 1: empty bar (20 kg) × 10
// Set 2: 40% × 8
// Set 3: 60% × 5
// Set 4: 75% × 3 (included when working weight ≥ 40 kg)
// Set 5: 85% × 2 (added when working weight ≥ 60 kg)
const BAR_KG = 20;          // Olympic barbell in kg (was 45 lb)
const WARMUP_MIN_FULL = 40; // below this, sets 4 & 5 overlap working sets (~95 lb)
const WARMUP_HEAVY = 60;    // at/above this, add the top 85% single (~135 lb)
function buildCompoundWarmup(workingWeight: number): WorkingSet[] {
  const sets: WorkingSet[] = [];

  // Set 1: bar only — always included for compound lifts
  sets.push({ weight: BAR_KG, reps: 10 });

  // Set 2: 40% of working weight
  sets.push({ weight: roundToNearest5(workingWeight * 0.4), reps: 8 });

  // Set 3: 60%
  sets.push({ weight: roundToNearest5(workingWeight * 0.6), reps: 5 });

  // Set 4 and 5 only make sense when working weight is high enough
  if (workingWeight < WARMUP_MIN_FULL) {
    // Weight is so low that sets 4 and 5 would overlap with working sets — skip both
    return sets;
  }

  // Set 4: 75%
  sets.push({ weight: roundToNearest5(workingWeight * 0.75), reps: 3 });

  // Set 5: 85% — only when working weight is heavy enough to warrant a top single-ish set
  if (workingWeight >= WARMUP_HEAVY) {
    sets.push({ weight: roundToNearest5(workingWeight * 0.85), reps: 2 });
  }

  return sets;
}

// Build isolation warm-up: 2 sets at moderate percentages
function buildIsolationWarmup(workingWeight: number): WorkingSet[] {
  return [
    { weight: roundToNearest5(workingWeight * 0.5), reps: 12 },
    { weight: roundToNearest5(workingWeight * 0.7), reps: 8 },
  ];
}

// Main export: generate warm-up sets for a given exercise and working weight
export function getWarmupSets(
  workingWeight: number,
  exerciseName: string
): WorkingSet[] {
  const category = getWarmupCategory(exerciseName);

  switch (category) {
    case 'compound':
      return buildCompoundWarmup(workingWeight);

    case 'isolation':
      return buildIsolationWarmup(workingWeight);

    case 'bodyweight':
      // No dedicated warm-up — first working set serves as warm-up (standard practice)
      return [];
  }
}
