// src/progression.ts
// The core progression engine — encodes the coach's observed loading rules, distilled from
// 15 athletes / 6,276 sessions via the CoachDecisions pipeline (see CoachDecisions/CLAUDE.md).
//
// Distilled rules (these SUPERSEDE the original textbook thresholds):
//   • The coach increases load when the athlete still has reserve (~2–3 RIR) AND has held the
//     weight for the category's wait window — NOT when grinding to ≤2 RIR. Increases cluster at
//     2–3 RIR; the coach consolidates (holds) only when the athlete is near failure (≤1 RIR).
//   • The robust signal is the wait window (large-N): ~2 sessions at a weight for lower/push/pull,
//     ~3 for triceps/accessory. The RIR floor is a sanity gate, not a finely-tuned threshold
//     (RIR-before-increase is thin, free-text data — treated coarsely on purpose).
//   • Increment: 5 kg lower-body, 2.5 kg upper/accessory. (No 10 kg tier — that was lb mislabeled.)
//   • Leg press is a volume tool — never driven by load progression.
//
// All weights are in kg.

import { AthleteHistory, ProgressionDecision, WorkingSet } from './types';
import {
  avgRIR,
  getRecentSessions,
  classifyMovement,
  getCategoryIncrement,
  getMinSessionsAtWeight,
  isVolumeOnly,
  consecutiveSessionsAtWeight,
  roundToHalfKg,
  getMaxWeight,
} from './utils';

// Main function: analyze session history and return a progression decision
export function getProgressionDecision(
  history: AthleteHistory,
  exerciseName: string
): ProgressionDecision {
  const normalizedName = exerciseName.toLowerCase().trim();

  // ── Leg press (and other volume-only lifts): never drive weight progression ──────────
  // Distilled rule: leg press accumulates ~0 net load across the entire roster — it is
  // programmed for volume, not strength. Checked first so the "lower → 5 kg" branch never
  // progresses it.
  if (isVolumeOnly(exerciseName)) {
    const recent = getRecentSessions(history.sessions, exerciseName, 1);
    const ex = recent[0]?.exercises.find(
      e => e.name.toLowerCase().trim() === normalizedName && !e.isWarmup
    );
    const lastWeight = ex ? getMaxWeight(ex.sets) : 0;
    return {
      action: 'hold',
      suggestedWeight: lastWeight,
      increment: 0,
      confidence: 'high',
      reason: 'Leg press is programmed as a volume tool in this system — hold weight, add reps/volume rather than load',
    };
  }

  // ── Missed last session: hold (don't progress off an incomplete data point) ───────────
  // getRecentSessions returns only completed sessions, so a missed most-recent session would
  // otherwise be invisible and produce a false 'increase'.
  const allSessionsWithExercise = history.sessions
    .filter(s =>
      s.exercises.some(e => e.name.toLowerCase().trim() === normalizedName && !e.isWarmup)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const rawLastSession = allSessionsWithExercise[0];
  if (rawLastSession?.status === 'missed') {
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

  // Average RIR across the last 2 sessions (stability vs. a single noisy session)
  const last2Sessions = recentSessions.slice(-2);
  const allSetsLast2: WorkingSet[] = last2Sessions.flatMap(sess => {
    const ex = sess.exercises.find(
      e => e.name.toLowerCase().trim() === normalizedName && !e.isWarmup
    );
    return ex ? ex.sets : [];
  });
  const recentAvgRIR = avgRIR(allSetsLast2);

  const category = classifyMovement(exerciseName);

  // ── Hold conditions (safety first) ───────────────────────────────────────────────────

  if (lastSession.isDeload === true) {
    return {
      action: 'hold',
      suggestedWeight: lastWeight,
      increment: 0,
      confidence: 'high',
      reason: 'Currently in a deload week — hold weight, focus on movement quality',
    };
  }

  // Consolidate near failure: the coach almost never adds load at ≤1 RIR (and never at 0).
  if (lastAvgRIR !== null && lastAvgRIR <= 1) {
    return {
      action: 'hold',
      suggestedWeight: lastWeight,
      increment: 0,
      confidence: 'high',
      reason: `Last session averaged ${lastAvgRIR.toFixed(1)} RIR (≤ 1, near failure) — consolidate at this weight before adding load`,
    };
  }

  // ── Progression trigger ───────────────────────────────────────────────────────────────
  // Increase when: the athlete has reserve (avg ≥ 2 RIR over the last 2 sessions) AND has held
  // the weight for the category's wait window AND both recent sessions were completed.
  const minSessions = getMinSessionsAtWeight(category);
  const sessionsAtWeight = consecutiveSessionsAtWeight(recentSessions, exerciseName);
  const allCompleted = last2Sessions.every(s => s.status === 'completed');
  const hasReserve = recentAvgRIR !== null && recentAvgRIR >= 2;

  if (hasReserve && allCompleted && sessionsAtWeight >= minSessions) {
    const increment = getCategoryIncrement(category);
    const suggestedWeight = roundToHalfKg(lastWeight + increment);
    return {
      action: 'increase',
      suggestedWeight,
      increment,
      confidence: 'high',
      reason: `${sessionsAtWeight} sessions at this weight with ~${(recentAvgRIR ?? 0).toFixed(1)} RIR in reserve — ready to progress (+${increment} kg, ${category})`,
    };
  }

  // ── Hold (trigger not met) — explain which condition is missing ───────────────────────
  if (recentAvgRIR === null) {
    return {
      action: 'hold',
      suggestedWeight: lastWeight,
      increment: 0,
      confidence: 'low',
      reason: 'No RIR data recorded — cannot assess readiness to progress; hold weight and start logging RIR',
    };
  }

  if (sessionsAtWeight < minSessions) {
    return {
      action: 'hold',
      suggestedWeight: lastWeight,
      increment: 0,
      confidence: 'medium',
      reason: `Only ${sessionsAtWeight} session(s) at this weight — coach holds ~${minSessions} for ${category} work before adding load`,
    };
  }

  return {
    action: 'hold',
    suggestedWeight: lastWeight,
    increment: 0,
    confidence: 'medium',
    reason: `Average RIR ${recentAvgRIR.toFixed(1)} over the last 2 sessions — hold at current weight`,
  };
}
