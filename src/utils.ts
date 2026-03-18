// src/utils.ts

import { WorkingSet, Session, TrainingPhase } from './types';

export type LiftType = 'barbell-upper' | 'barbell-lower' | 'dumbbell' | 'machine';

// Average RIR across a set of WorkingSet arrays
// Returns null if no RIR data present at all
export function avgRIR(sets: WorkingSet[]): number | null {
  const rirValues = sets.map(s => s.rir).filter((r): r is number => r !== undefined);
  if (rirValues.length === 0) return null;
  return rirValues.reduce((sum, r) => sum + r, 0) / rirValues.length;
}

// Get the last N completed sessions that contain this exercise
export function getRecentSessions(
  sessions: Session[],
  exerciseName: string,
  count: number
): Session[] {
  const normalizedName = exerciseName.toLowerCase().trim();

  // Sort descending by date so we get most recent first
  const completed = sessions
    .filter(s => s.status === 'completed')
    .filter(s =>
      s.exercises.some(
        e => e.name.toLowerCase().trim() === normalizedName && !e.isWarmup
      )
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return completed.slice(0, count).reverse(); // return in chronological order
}

// Count how many completed sessions have occurred since the last deload date
// If no lastDeloadDate, count all completed sessions
export function sessionsSinceDeload(
  sessions: Session[],
  lastDeloadDate?: string
): number {
  const completed = sessions.filter(s => s.status === 'completed' && !s.isDeload);

  if (!lastDeloadDate) {
    return completed.length;
  }

  const cutoff = new Date(lastDeloadDate).getTime();
  return completed.filter(s => new Date(s.date).getTime() > cutoff).length;
}

// Detect training phase from sessions since last deload
// 0-4 = 'early', 5-8 = 'mid', 9+ = 'late'
// If currently in deload: 'deload'
// If last deload was within last 4 sessions (reload period): 'reload'
export function detectPhase(
  sessionCount: number,
  isCurrentlyDeloading: boolean
): TrainingPhase {
  if (isCurrentlyDeloading) return 'deload';

  // Reload phase: immediately post-deload (first 4 sessions after returning)
  // The reload window is handled externally — here we map counts to phases
  if (sessionCount <= 4) return 'early';
  if (sessionCount <= 8) return 'mid';
  return 'late';
}

// Classify lift type for increment calculation
// Priority (highest wins): dumbbell > machine > barbell-lower > barbell-upper
export function classifyLift(exerciseName: string): LiftType {
  const name = exerciseName.toLowerCase();

  // Dumbbell: highest priority — any mention of "db", "dumbbell"
  if (/\bdb\b/.test(name) || /dumbbell/.test(name)) {
    return 'dumbbell';
  }

  // Machine: cable, machine, cybex, pec deck, lat pulldown, leg extension, leg curl, assisted, smith, seated
  if (
    /cable/.test(name) ||
    /machine/.test(name) ||
    /cybex/.test(name) ||
    /pec deck/.test(name) ||
    /lat pulldown/.test(name) ||
    /leg extension/.test(name) ||
    /leg curl/.test(name) ||
    /\bassisted\b/.test(name) ||
    /smith/.test(name) ||
    /seated/.test(name)
  ) {
    return 'machine';
  }

  // Barbell lower: squat, deadlift, DL, trap bar, RDL, Romanian deadlift, split squat, good morning, hip thrust with bar
  if (
    /\bsquat\b/.test(name) ||
    /\bdeadlift\b/.test(name) ||
    /\bdl\b/.test(name) ||
    /trap bar/.test(name) ||
    /\brdl\b/.test(name) ||
    /romanian/.test(name) ||
    /split squat/.test(name) ||
    /good morning/.test(name) ||
    /hip thrust/.test(name)
  ) {
    return 'barbell-lower';
  }

  // Barbell upper: bench press, overhead press, OHP, military press, incline press, barbell row, BB row, barbell curl
  if (
    /bench press/.test(name) ||
    /overhead press/.test(name) ||
    /\bohp\b/.test(name) ||
    /military press/.test(name) ||
    /incline press/.test(name) ||
    /barbell row/.test(name) ||
    /\bbb row\b/.test(name) ||
    /barbell curl/.test(name)
  ) {
    return 'barbell-upper';
  }

  // Default fallback: treat as machine (isolation-style increment)
  return 'machine';
}

// Round to nearest 5 lbs
export function roundToNearest5(weight: number): number {
  return Math.round(weight / 5) * 5;
}

// Get the highest weight used in a set of WorkingSets
export function getMaxWeight(sets: WorkingSet[]): number {
  if (sets.length === 0) return 0;
  return Math.max(...sets.map(s => s.weight));
}

// Check if RIR trend is declining across sessions (each lower than last)
// Declining means each subsequent avg is strictly lower — athlete is getting closer to failure
// Used to shift phase one step later (more conservative progression)
export function isRIRTrendingDown(recentAvgRIRs: (number | null)[]): boolean {
  // Filter out nulls to compare only sessions with RIR data
  const withData = recentAvgRIRs.filter((r): r is number => r !== null);
  if (withData.length < 2) return false;

  // Check if each value is lower than the one before it
  for (let i = 1; i < withData.length; i++) {
    if (withData[i] >= withData[i - 1]) return false;
  }
  return true;
}
