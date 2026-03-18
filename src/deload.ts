// src/deload.ts
// Rule 3: Deload detection and reload planning
// Key insight from data: deloads are reactive, not calendar-based.
// Athlete A's RIR dropped to 1.3–1.6 consistently before every deload — this is the signal (Finding 2).

import { AthleteHistory } from './types';
import { avgRIR, sessionsSinceDeload, getRecentSessions } from './utils';

// Analyze session history and determine whether a deload warning or trigger is active
export function getDeloadStatus(history: AthleteHistory): {
  deloadWarning: boolean;
  deloadTriggered: boolean;
  reason: string;
} {
  const sinceDeload = sessionsSinceDeload(history.sessions, history.lastDeloadDate);

  // Need at least 8 sessions since last deload before a deload warning can fire
  // This prevents false positives early in a training block
  if (sinceDeload < 8) {
    return {
      deloadWarning: false,
      deloadTriggered: false,
      reason: `Only ${sinceDeload} sessions since last deload — too early to consider deload (minimum: 8)`,
    };
  }

  // Gather last 3 sessions that have RIR data across any exercise
  // We use all exercises to get a holistic fatigue picture — one lift alone can be misleading
  const completedSessions = history.sessions
    .filter(s => s.status === 'completed' && !s.isDeload)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);

  if (completedSessions.length < 3) {
    return {
      deloadWarning: false,
      deloadTriggered: false,
      reason: 'Not enough session history to assess deload readiness',
    };
  }

  // Compute per-session avg RIR (across all exercises in that session)
  const sessionAvgRIRs: (number | null)[] = completedSessions.map(sess => {
    const allSets = sess.exercises
      .filter(e => !e.isWarmup)
      .flatMap(e => e.sets);
    return avgRIR(allSets);
  });

  // Filter to sessions that actually have RIR data
  const sessionsWithRIR = sessionAvgRIRs.filter((r): r is number => r !== null);

  if (sessionsWithRIR.length === 0) {
    return {
      deloadWarning: false,
      deloadTriggered: false,
      reason: 'No RIR data in recent sessions — cannot assess deload readiness',
    };
  }

  const overallAvg = sessionsWithRIR.reduce((s, r) => s + r, 0) / sessionsWithRIR.length;

  // Check if any of the last 3 sessions hit RIR = 0 (actual failure)
  const anySessionHitFailure = completedSessions.some(sess => {
    const allSets = sess.exercises.filter(e => !e.isWarmup).flatMap(e => e.sets);
    return allSets.some(set => set.rir === 0);
  });

  // ── Deload triggered immediately: avg RIR < 1.0 ──────────────────────────────
  // Athlete is consistently training to or past failure — continuing risks injury or burnout
  if (overallAvg < 1.0) {
    return {
      deloadWarning: true,
      deloadTriggered: true,
      reason: `Average RIR across last 3 sessions is ${overallAvg.toFixed(2)} (< 1.0) — athlete is at or past failure threshold; deload immediately`,
    };
  }

  // ── Deload warning: all three conditions met ──────────────────────────────────
  // RIR is low but not yet critical — warn now, trigger if it continues
  const warningConditions =
    sinceDeload >= 8 &&
    overallAvg < 1.5 &&
    anySessionHitFailure;

  if (!warningConditions) {
    return {
      deloadWarning: false,
      deloadTriggered: false,
      reason: `Sessions since deload: ${sinceDeload}, avg RIR: ${overallAvg.toFixed(2)}, failure sets: ${anySessionHitFailure} — no deload signal yet`,
    };
  }

  // Warning is active — check if it has persisted for 2+ consecutive sessions
  // If the athlete has been warned-level fatigued for 2+ sessions, trigger the deload
  // We assess this by checking the last 5 sessions for persistent low-RIR pattern
  const last5Completed = history.sessions
    .filter(s => s.status === 'completed' && !s.isDeload)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  let consecutiveWarningSessions = 0;
  for (const sess of last5Completed) {
    const allSets = sess.exercises.filter(e => !e.isWarmup).flatMap(e => e.sets);
    const sessionRIR = avgRIR(allSets);
    const hasFailure = allSets.some(set => set.rir === 0);

    // Session qualifies as "warning level" if avg RIR < 1.5 and includes a failure set
    if (sessionRIR !== null && sessionRIR < 1.5 && hasFailure) {
      consecutiveWarningSessions++;
    } else {
      break; // streak broken
    }
  }

  if (consecutiveWarningSessions >= 2) {
    return {
      deloadWarning: true,
      deloadTriggered: true,
      reason: `Warning-level fatigue persisted for ${consecutiveWarningSessions} consecutive sessions (avg RIR ${overallAvg.toFixed(2)}, failure sets present) — deload triggered`,
    };
  }

  return {
    deloadWarning: true,
    deloadTriggered: false,
    reason: `${sinceDeload} sessions since last deload, avg RIR ${overallAvg.toFixed(2)} with failure sets — deload warning active; monitor next session`,
  };
}

// Generate the deload session plan for a given working weight
// Deload = 40–50% of working weight, same rep target, –1 set
export function getDeloadSessionPlan(currentWeight: number): {
  deloadWeight: number;   // 40-50% of working weight
  repTarget: number;      // same as normal (reps passed in externally)
  setReduction: number;   // -1 set per exercise
} {
  // Use 45% as the midpoint of the 40–50% range — keeps movement pattern fresh without accumulating fatigue
  const deloadWeight = Math.round((currentWeight * 0.45) / 5) * 5;

  return {
    deloadWeight: Math.max(deloadWeight, 45), // never go below bar weight
    repTarget: 0,    // caller fills in from last session's rep target
    setReduction: 1, // drop 1 set per exercise during deload week
  };
}

// Calculate reload weight for each week of the post-deload return
// Progressive reload prevents re-injury and re-sensitizes the body to load (Finding 2)
export function getReloadWeight(preDeloadWeight: number, weekNumber: number): number {
  let percentage: number;

  switch (weekNumber) {
    case 1:
      percentage = 0.625; // midpoint of 60–65%
      break;
    case 2:
      percentage = 0.725; // midpoint of 70–75%
      break;
    case 3:
      percentage = 0.825; // midpoint of 80–85%
      break;
    default:
      // Week 4+: resume from 80–85%, normal progression takes over
      percentage = 0.825;
      break;
  }

  return Math.round((preDeloadWeight * percentage) / 5) * 5;
}
