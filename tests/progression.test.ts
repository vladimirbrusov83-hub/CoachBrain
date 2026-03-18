// tests/progression.test.ts

import { describe, it, expect } from 'vitest';
import { getProgressionDecision } from '../src/progression';
import { AthleteHistory, Session } from '../src/types';

// Helper: build a simple AthleteHistory with N completed sessions for one exercise
function buildHistory(sessions: Partial<Session>[], lastDeloadDate?: string): AthleteHistory {
  const fullSessions: Session[] = sessions.map((s, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    status: 'completed',
    exercises: [],
    ...s,
  }));
  return { sessions: fullSessions, lastDeloadDate };
}

// Helper: build a session with a bench press entry
function benchSession(
  weight: number,
  rir: number | undefined,
  overrides: Partial<Session> = {}
): Partial<Session> {
  return {
    status: 'completed',
    exercises: [
      {
        name: 'BB bench press',
        sets: [
          { weight, reps: 8, rir },
          { weight, reps: 8, rir },
          { weight, reps: 8, rir },
        ],
      },
    ],
    ...overrides,
  };
}

describe('getProgressionDecision', () => {
  // ── Basic trigger tests ────────────────────────────────────────────────────

  it('2 sessions at avg 2.0 RIR → action = increase', () => {
    const history = buildHistory([
      benchSession(185, 2),
      benchSession(185, 2),
    ]);
    const result = getProgressionDecision(history, 'BB bench press');
    expect(result.action).toBe('increase');
  });

  it('last session RIR = 0 → action = hold', () => {
    const history = buildHistory([
      benchSession(185, 2),
      benchSession(185, 0),
    ]);
    const result = getProgressionDecision(history, 'BB bench press');
    expect(result.action).toBe('hold');
    expect(result.reason).toMatch(/failure/i);
  });

  it('only 1 completed session → action = insufficient_data', () => {
    const history = buildHistory([
      benchSession(185, 2),
    ]);
    const result = getProgressionDecision(history, 'BB bench press');
    expect(result.action).toBe('insufficient_data');
    expect(result.confidence).toBe('low');
  });

  it('avg RIR ≥ 3.0 → action = hold', () => {
    const history = buildHistory([
      benchSession(185, 3),
      benchSession(185, 4),
    ]);
    const result = getProgressionDecision(history, 'BB bench press');
    expect(result.action).toBe('hold');
    expect(result.reason).toMatch(/3\.0|plenty of capacity/i);
  });

  // ── Phase and increment tests ──────────────────────────────────────────────

  it('bench press in mid phase (6 sessions since deload) → +10 lbs', () => {
    // 6 sessions since deload puts us in mid phase — bench upper = +10 in mid
    const sessionsData: Partial<Session>[] = [];
    // 6 sessions total since deload (no lastDeloadDate means all sessions count)
    for (let i = 0; i < 6; i++) {
      sessionsData.push({
        ...benchSession(185, 2),
        date: `2024-0${i < 6 ? 1 : 2}-${String(i + 1).padStart(2, '0')}`,
      });
    }
    const history: AthleteHistory = {
      sessions: sessionsData.map((s, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        status: 'completed',
        exercises: [],
        ...s,
      })),
    };
    const result = getProgressionDecision(history, 'BB bench press');
    expect(result.action).toBe('increase');
    expect(result.increment).toBe(10);
  });

  it('bench press in late phase (10 sessions since deload) → +5 lbs', () => {
    const sessionsData: Partial<Session>[] = Array.from({ length: 10 }, (_, i) =>
      benchSession(185, 2)
    );
    const history: AthleteHistory = {
      sessions: sessionsData.map((s, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        status: 'completed',
        exercises: [],
        ...s,
      })),
    };
    const result = getProgressionDecision(history, 'BB bench press');
    expect(result.action).toBe('increase');
    expect(result.increment).toBe(5);
  });

  it('squat in late phase → +10 lbs (lower body stays at 10 throughout)', () => {
    const sessionsData = Array.from({ length: 10 }, () => ({
      status: 'completed' as const,
      exercises: [
        {
          name: 'squat',
          sets: [
            { weight: 225, reps: 5, rir: 2 },
            { weight: 225, reps: 5, rir: 2 },
            { weight: 225, reps: 5, rir: 2 },
          ],
        },
      ],
    }));
    const history: AthleteHistory = {
      sessions: sessionsData.map((s, i) => ({
        ...s,
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      })),
    };
    const result = getProgressionDecision(history, 'squat');
    expect(result.action).toBe('increase');
    expect(result.increment).toBe(10); // barbell-lower: always +10
  });

  it('dumbbell exercise → +5 always (regardless of phase)', () => {
    const sessionsData = Array.from({ length: 10 }, () => ({
      status: 'completed' as const,
      exercises: [
        {
          name: 'DB shoulder press',
          sets: [
            { weight: 50, reps: 10, rir: 2 },
            { weight: 50, reps: 10, rir: 2 },
          ],
        },
      ],
    }));
    const history: AthleteHistory = {
      sessions: sessionsData.map((s, i) => ({
        ...s,
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      })),
    };
    const result = getProgressionDecision(history, 'DB shoulder press');
    expect(result.action).toBe('increase');
    expect(result.increment).toBe(5); // dumbbell: always +5
  });

  it('last RIR exactly 1 → increment reduced one step (10 → 5 for barbell-upper mid)', () => {
    // 6 sessions = mid phase, bench = barbell-upper, base increment = 10
    // Last RIR = 1 exactly → should reduce to 5
    const sessionsData = Array.from({ length: 5 }, () => benchSession(185, 2));
    // Last session: RIR = 1 exactly
    sessionsData.push(benchSession(185, 1));

    const history: AthleteHistory = {
      sessions: sessionsData.map((s, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        status: 'completed',
        exercises: [],
        ...s,
      })),
    };
    const result = getProgressionDecision(history, 'BB bench press');
    expect(result.action).toBe('increase');
    expect(result.increment).toBe(5); // reduced from 10 → 5
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('missed last session → action = hold with low confidence', () => {
    const history = buildHistory([
      benchSession(185, 2),
      { ...benchSession(185, 2), status: 'missed' },
    ]);
    const result = getProgressionDecision(history, 'BB bench press');
    expect(result.action).toBe('hold');
    expect(result.confidence).toBe('low');
  });

  it('currently in deload → action = hold', () => {
    const history = buildHistory([
      benchSession(185, 2),
      { ...benchSession(185, 2), isDeload: true },
    ]);
    const result = getProgressionDecision(history, 'BB bench press');
    expect(result.action).toBe('hold');
    expect(result.reason).toMatch(/deload/i);
  });
});
