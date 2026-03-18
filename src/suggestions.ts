// src/suggestions.ts
// Rule 5: Assembles the complete CoachDecision by orchestrating all modules
// This is the public-facing integration layer — callers should use getCoachDecision()
// rather than calling each module individually.

import { AthleteHistory, CoachDecision, NextSession, WorkingSet, SessionStatus } from './types';
import { getProgressionDecision } from './progression';
import { getDeloadStatus } from './deload';
import { getWarmupSets } from './warmup';
import {
  avgRIR,
  getRecentSessions,
  sessionsSinceDeload,
  detectPhase,
} from './utils';

// Assemble a complete coaching recommendation for a specific exercise
export function getCoachDecision(
  history: AthleteHistory,
  exerciseName: string
): CoachDecision {
  const normalizedName = exerciseName.toLowerCase().trim();

  // ── Step 1: Progression decision ─────────────────────────────────────────────
  const progression = getProgressionDecision(history, exerciseName);

  // ── Step 2: Deload status ─────────────────────────────────────────────────────
  const deloadStatus = getDeloadStatus(history);

  // ── Step 3: Pull last session data ───────────────────────────────────────────
  const recentSessions = getRecentSessions(history.sessions, exerciseName, 3);
  const lastSession = recentSessions[recentSessions.length - 1];

  // Safe defaults when no session history exists
  let lastSessionSummary: CoachDecision['lastSession'] = {
    date: '',
    weight: 0,
    sets: 0,
    reps: 0,
    avgRIR: null,
    status: 'missed',
  };

  if (lastSession) {
    const lastExercise = lastSession.exercises.find(
      e => e.name.toLowerCase().trim() === normalizedName && !e.isWarmup
    );

    if (lastExercise) {
      const workingSets = lastExercise.sets;
      const maxWeight = workingSets.length > 0
        ? Math.max(...workingSets.map(s => s.weight))
        : 0;
      const avgReps = workingSets.length > 0
        ? Math.round(workingSets.reduce((sum, s) => sum + s.reps, 0) / workingSets.length)
        : 0;

      lastSessionSummary = {
        date: lastSession.date,
        weight: maxWeight,
        sets: workingSets.length,
        reps: avgReps,
        avgRIR: avgRIR(workingSets),
        status: lastSession.status,
      };
    }
  }

  // ── Step 4: Build warmup sets using suggested weight ─────────────────────────
  const suggestedWeight = progression.suggestedWeight > 0
    ? progression.suggestedWeight
    : lastSessionSummary.weight;

  const warmupSets = getWarmupSets(suggestedWeight || 45, exerciseName);

  // ── Step 5: Build working sets for next session ───────────────────────────────
  // Use same set/rep scheme as last session but with the new suggested weight
  // The athlete's structure is preserved — only the load changes
  let workingSets: WorkingSet[] = [];

  if (lastSession) {
    const lastExercise = lastSession.exercises.find(
      e => e.name.toLowerCase().trim() === normalizedName && !e.isWarmup
    );

    if (lastExercise && lastExercise.sets.length > 0) {
      workingSets = lastExercise.sets.map(set => ({
        weight: suggestedWeight,
        reps: set.reps,
        // RIR targets are intentionally cleared for next session — athlete fills these in
      }));
    }
  }

  // Fallback if no prior sets to reference
  if (workingSets.length === 0) {
    workingSets = [
      { weight: suggestedWeight, reps: 8 },
      { weight: suggestedWeight, reps: 8 },
      { weight: suggestedWeight, reps: 8 },
    ];
  }

  const suggestedSets = workingSets.length;
  const suggestedReps = workingSets.length > 0
    ? Math.round(workingSets.reduce((sum, s) => sum + s.reps, 0) / workingSets.length)
    : 8;

  const nextSession: NextSession = {
    warmupSets,
    workingSets,
    suggestedSets,
    suggestedReps,
  };

  // ── Step 6: Determine training phase and sessions since deload ────────────────
  const sinceDeload = sessionsSinceDeload(history.sessions, history.lastDeloadDate);
  const isCurrentlyDeloading = lastSession?.isDeload === true;
  const phase = detectPhase(sinceDeload, isCurrentlyDeloading);

  return {
    exercise: exerciseName,
    phase,
    sessionsSinceDeload: sinceDeload,
    lastSession: lastSessionSummary,
    nextSession,
    progression,
    deloadWarning: deloadStatus.deloadWarning,
    deloadTriggered: deloadStatus.deloadTriggered,
  };
}
