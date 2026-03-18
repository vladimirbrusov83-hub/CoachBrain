// src/index.ts
// Public API for CoachBrain — import from here, not from individual modules

// Core decision functions
export { getCoachDecision } from './suggestions';
export { getProgressionDecision } from './progression';
export { getDeloadStatus, getDeloadSessionPlan, getReloadWeight } from './deload';
export { getWarmupSets } from './warmup';

// All types
export type {
  WorkingSet,
  ExerciseEntry,
  SessionStatus,
  Session,
  ProgressionAction,
  TrainingPhase,
  ProgressionDecision,
  NextSession,
  CoachDecision,
  AthleteHistory,
} from './types';
