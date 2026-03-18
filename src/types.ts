// src/types.ts

export interface WorkingSet {
  weight: number;         // in lbs
  reps: number;
  rir?: number;           // 0–10; undefined if athlete did not record it
  rpe?: number;           // 0–10; optional alternative to RIR
  effortScore?: number;   // coach's X/10 session rating; optional
}

export interface ExerciseEntry {
  name: string;           // exact name as logged, e.g. "BB bench press"
  sets: WorkingSet[];
  coachNote?: string;     // inline coach note, e.g. "Go to 205 next" or "Stay"
  isWarmup?: boolean;     // true if this entry block is warm-up sets
}

export type SessionStatus = 'completed' | 'missed';

export interface Session {
  date: string;           // ISO 8601, e.g. "2024-07-30"
  status: SessionStatus;
  exercises: ExerciseEntry[];
  isDeload?: boolean;     // true if part of a deload week
  sessionTitle?: string;  // optional label, e.g. "Day 1", "Upper A"
}

export type ProgressionAction =
  | 'increase'
  | 'hold'
  | 'deload'
  | 'reload'
  | 'insufficient_data';

export type TrainingPhase =
  | 'early'               // 0–4 sessions post-deload
  | 'mid'                 // 5–8 sessions post-deload
  | 'late'                // 9+ sessions post-deload
  | 'deload'
  | 'reload'
  | 'unknown';

export interface ProgressionDecision {
  action: ProgressionAction;
  suggestedWeight: number;
  increment: number;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface NextSession {
  warmupSets: WorkingSet[];
  workingSets: WorkingSet[];
  suggestedSets: number;
  suggestedReps: number;
}

export interface CoachDecision {
  exercise: string;
  phase: TrainingPhase;
  sessionsSinceDeload: number;
  lastSession: {
    date: string;
    weight: number;
    sets: number;
    reps: number;
    avgRIR: number | null;
    status: SessionStatus;
  };
  nextSession: NextSession;
  progression: ProgressionDecision;
  deloadWarning: boolean;
  deloadTriggered: boolean;
}

export interface AthleteHistory {
  sessions: Session[];
  lastDeloadDate?: string;
}
