// src/progression.ts
// Rule 1 (increase) and Rule 2 (hold) — the core progression engine

import { AthleteHistory, ProgressionDecision, WorkingSet } from './types';
import {
  avgRIR,
  getRecentSessions,
  sessionsSinceDeload,
  detectPhase,
  classifyLift,
  roundToNearest5,
  getMaxWeight,
  isRIRTrendingDown,
  LiftType,
} from './utils';

// Increment table by lift type and phase
// Data-derived: early/mid phase athletes absorb larger jumps cleanly post-deload (Finding 3)
function getBaseIncrement(liftType: LiftType, phase: string): number {
  switch (liftType) {
    case 'barbell-upper':
      // +10 in early/mid, +5 only when deeply into a training block (late phase)
      if (phase === 'early' || phase === 'mid') return 10;
      return 5; // late

    case 'barbell-lower':
      // Lower body tolerates larger jumps across all phases — stronger muscles, larger absolute loads
      return 10;

    case 'dumbbell':
      // Dumbbell increments are always +5: smaller plates, finer control needed
      return 5;

    case 'machine':
      // Machine increments are always +5: stack plates are small, stabilizer demand is low
      return 5;
  }
}

// Reduce increment by one step when last RIR === 1 exactly
// Athlete is very close to failure — a smaller jump is safer
function reduceIncrement(increment: number): number {
  if (increment >= 10) return 5;
  if (increment >= 5) return 2.5;
  return increment; // already at minimum, no further reduction
}

// Main function: analyze session history and return a progression decision
export function getProgressionDecision(
  history: AthleteHistory,
  exerciseName: string
): ProgressionDecision {
  const normalizedName = exerciseName.toLowerCase().trim();

  // Check if the most recent session for this exercise (any status) was missed.
  // getRecentSessions only returns completed sessions, so a missed last session would
  // otherwise be invisible — leading to a false 'increase' decision (Rule 2, missed = hold).
  const allSessionsWithExercise = history.sessions
    .filter(s =>
      s.exercises.some(e => e.name.toLowerCase().trim() === normalizedName && !e.isWarmup)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const rawLastSession = allSessionsWithExercise[0];
  if (rawLastSession?.status === 'missed') {
    // Find last completed weight to report as suggestedWeight (don't regress)
    const lastCompleted = allSessionsWithExercise.find(s => s.status === 'completed');
    const lastCompletedEx = lastCompleted?.exercises.find(
      e => e.name.toLowerCase().trim() === normalizedName && !e.isWarmup
    );
    const lastWeight = lastCompletedEx ? getMaxWeight(lastCompletedEx.sets) : 0;

    return {
      action: 'hold',
      suggestedWeight: lastWeight,
      increment: 0,
      confidence: 'low',
      reason: 'Last session was missed — repeat the weight before progressing',
    };
  }

  const recentSessions = getRecentSessions(history.sessions, exerciseName, 5);

  // Need at least 2 completed sessions to make a meaningful decision
  if (recentSessions.length < 2) {
    const lastSess = recentSessions[0];
    const lastExercise = lastSess?.exercises.find(
      e => e.name.toLowerCase().trim() === normalizedName && !e.isWarmup
    );
    const lastWeight = lastExercise ? getMaxWeight(lastExercise.sets) : 0;

    return {
      action: 'insufficient_data',
      suggestedWeight: lastWeight,
      increment: 0,
      confidence: 'low',
      reason: 'Insufficient session history — need 2+ completed sessions to make a progression decision',
    };
  }

  const lastSession = recentSessions[recentSessions.length - 1];
  const lastExercise = lastSession.exercises.find(
    e => e.name.toLowerCase().trim() === normalizedName && !e.isWarmup
  );

  if (!lastExercise) {
    return {
      action: 'insufficient_data',
      suggestedWeight: 0,
      increment: 0,
      confidence: 'low',
      reason: 'Exercise not found in last session',
    };
  }

  const lastWeight = getMaxWeight(lastExercise.sets);
  const lastAvgRIR = avgRIR(lastExercise.sets);

  // Collect avg RIR for the last 2–3 sessions to check trend and overall average
  const last3Sessions = recentSessions.slice(-3);
  const last3AvgRIRs: (number | null)[] = last3Sessions.map(sess => {
    const ex = sess.exercises.find(
      e => e.name.toLowerCase().trim() === normalizedName && !e.isWarmup
    );
    if (!ex) return null;
    return avgRIR(ex.sets);
  });

  // Compute overall average RIR across all sets in last 2 sessions
  const last2Sessions = recentSessions.slice(-2);
  const allSetsLast2: WorkingSet[] = last2Sessions.flatMap(sess => {
    const ex = sess.exercises.find(
      e => e.name.toLowerCase().trim() === normalizedName && !e.isWarmup
    );
    return ex ? ex.sets : [];
  });
  const overallAvgRIR = avgRIR(allSetsLast2);

  // Determine training context
  const sinceDeload = sessionsSinceDeload(history.sessions, history.lastDeloadDate);
  const isCurrentlyDeloading = lastSession.isDeload === true;

  // If RIR is trending down across last 3, shift phase one step later (more conservative)
  const trendingDown = isRIRTrendingDown(last3AvgRIRs);
  let adjustedSinceDeload = sinceDeload;
  if (trendingDown) {
    // Shift one phase later: add enough to push into next threshold
    if (sinceDeload <= 4) adjustedSinceDeload = 5;       // early → mid
    else if (sinceDeload <= 8) adjustedSinceDeload = 9;  // mid → late
  }

  const phase = detectPhase(adjustedSinceDeload, isCurrentlyDeloading);
  const liftType = classifyLift(exerciseName);

  // ── Rule 2: Hold conditions (checked first — safety takes priority) ──────────
  // Any one of these means we hold weight and consolidate

  if (isCurrentlyDeloading) {
    return {
      action: 'hold',
      suggestedWeight: lastWeight,
      increment: 0,
      confidence: 'high',
      reason: 'Currently in a deload week — hold weight, focus on movement quality',
    };
  }

  if (lastSession.status === 'missed') {
    return {
      action: 'hold',
      suggestedWeight: lastWeight,
      increment: 0,
      confidence: 'low',
      reason: 'Last session was missed — repeat the weight before progressing',
    };
  }

  if (lastAvgRIR === 0) {
    // RIR = 0 means athlete hit failure — do not progress, consolidate first
    return {
      action: 'hold',
      suggestedWeight: lastWeight,
      increment: 0,
      confidence: 'high',
      reason: 'Last session hit 0 RIR (failure) — hold weight and consolidate before adding load',
    };
  }

  if (overallAvgRIR !== null && overallAvgRIR >= 3.0) {
    // Still too much in the tank — hold, the load is not challenging enough to warrant a bigger increase
    // But this still isn't a "progress" signal since we need ≤2.0 avg
    return {
      action: 'hold',
      suggestedWeight: lastWeight,
      increment: 0,
      confidence: 'medium',
      reason: `Average RIR across last 2 sessions is ${overallAvgRIR.toFixed(1)} (≥ 3.0) — athlete has plenty of capacity, hold weight to build consistency before increasing`,
    };
  }

  // ── Rule 1: Progression trigger (ALL must be true) ────────────────────────────
  const allSessionsCompleted = last2Sessions.every(s => s.status === 'completed');
  const hasEnoughSessions = recentSessions.length >= 2;
  const avgRIRMeetsThreshold = overallAvgRIR !== null && overallAvgRIR <= 2.0;
  const lastRIRNotZero = lastAvgRIR !== 0; // already handled above but explicit here

  if (
    hasEnoughSessions &&
    allSessionsCompleted &&
    avgRIRMeetsThreshold &&
    lastRIRNotZero &&
    !isCurrentlyDeloading
  ) {
    let increment = getBaseIncrement(liftType, phase);

    // If athlete is right at the edge (RIR = 1 exactly), reduce increment one step
    // This preserves momentum without overloading — Finding 3 observed this pattern
    if (lastAvgRIR === 1) {
      increment = reduceIncrement(increment);
    }

    const suggestedWeight = roundToNearest5(lastWeight + increment);
    const hasRIRData = last3AvgRIRs.some(r => r !== null);
    const confidence = hasRIRData && last2Sessions.length >= 2 ? 'high' : 'medium';

    return {
      action: 'increase',
      suggestedWeight,
      increment,
      confidence,
      reason: `${last2Sessions.length} consecutive sessions at avg ${(overallAvgRIR ?? 0).toFixed(1)} RIR — ready to progress (+${increment} lbs, ${phase} phase)`,
    };
  }

  // ── Fallback: not enough info to progress, hold ──────────────────────────────
  const noRIRAtAll = overallAvgRIR === null;
  return {
    action: 'hold',
    suggestedWeight: lastWeight,
    increment: 0,
    confidence: noRIRAtAll ? 'low' : 'medium',
    reason: noRIRAtAll
      ? 'No RIR data recorded — cannot assess readiness to progress; hold weight and start logging RIR'
      : `Conditions for progression not fully met — hold at current weight`,
  };
}
