// tests/deload.test.ts

import { describe, it, expect } from 'vitest';
import { getDeloadStatus, getDeloadSessionPlan, getReloadWeight } from '../src/deload';
import { AthleteHistory, Session } from '../src/types';

// Helper: build a session with arbitrary RIR values across all exercises
function makeSession(avgRIRValue: number, hasZeroRIR: boolean = false, overrides: Partial<Session> = {}): Session {
  const rirForSets = hasZeroRIR
    ? [0, avgRIRValue, avgRIRValue]
    : [avgRIRValue, avgRIRValue, avgRIRValue];

  return {
    date: '2024-01-01', // will be overridden by caller
    status: 'completed',
    exercises: [
      {
        name: 'BB bench press',
        sets: rirForSets.map(rir => ({ weight: 185, reps: 8, rir })),
      },
    ],
    ...overrides,
  };
}

function makeSessions(
  count: number,
  avgRIR: number,
  hasZeroRIR: boolean = false,
  startDate: Date = new Date('2024-01-01')
): Session[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i * 7);
    return {
      ...makeSession(avgRIR, hasZeroRIR),
      date: d.toISOString().split('T')[0],
    };
  });
}

describe('getDeloadStatus', () => {
  it('8 sessions, avg RIR 1.4, one session at 0 RIR → deloadWarning = true', () => {
    const sessions = makeSessions(8, 1.4, true);
    const history: AthleteHistory = { sessions };
    const result = getDeloadStatus(history);
    expect(result.deloadWarning).toBe(true);
  });

  it('fewer than 8 sessions → no warning, no trigger', () => {
    const sessions = makeSessions(5, 1.2, true);
    const history: AthleteHistory = { sessions };
    const result = getDeloadStatus(history);
    expect(result.deloadWarning).toBe(false);
    expect(result.deloadTriggered).toBe(false);
  });

  it('avg RIR < 1.0 across last 3 sessions → deloadTriggered immediately', () => {
    // Start with 5 normal sessions, then 3 very hard sessions
    const normalSessions = makeSessions(5, 2.0, false);
    const hardSessions = makeSessions(3, 0.6, true, new Date('2024-02-12'));
    const history: AthleteHistory = {
      sessions: [...normalSessions, ...hardSessions],
    };
    const result = getDeloadStatus(history);
    expect(result.deloadTriggered).toBe(true);
    expect(result.reason).toMatch(/1\.0|failure threshold/i);
  });

  it('warning active for 2+ consecutive sessions → deloadTriggered', () => {
    // 5 normal sessions, then 2+ consecutive warning-level sessions
    const normalSessions = makeSessions(5, 2.0, false);
    // These 3 sessions are all at warning level: avg < 1.5 AND has failure (RIR=0)
    const warningSessions = makeSessions(3, 1.2, true, new Date('2024-02-12'));
    const history: AthleteHistory = {
      sessions: [...normalSessions, ...warningSessions],
    };
    const result = getDeloadStatus(history);
    expect(result.deloadWarning).toBe(true);
    expect(result.deloadTriggered).toBe(true);
  });

  it('8+ sessions but avg RIR comfortably above threshold → no warning', () => {
    const sessions = makeSessions(10, 2.5, false);
    const history: AthleteHistory = { sessions };
    const result = getDeloadStatus(history);
    expect(result.deloadWarning).toBe(false);
    expect(result.deloadTriggered).toBe(false);
  });
});

describe('getDeloadSessionPlan', () => {
  it('returns 40-50% of working weight', () => {
    const plan = getDeloadSessionPlan(200);
    // 45% of 200 = 90, rounded to nearest 5
    expect(plan.deloadWeight).toBe(90);
    expect(plan.setReduction).toBe(1);
  });

  it('never goes below 45 lbs (bar weight)', () => {
    const plan = getDeloadSessionPlan(45);
    expect(plan.deloadWeight).toBeGreaterThanOrEqual(45);
  });

  it('rounds to nearest 5', () => {
    const plan = getDeloadSessionPlan(220);
    expect(plan.deloadWeight % 5).toBe(0);
  });
});

describe('getReloadWeight', () => {
  it('week 1 → 60-65% of preDeloadWeight', () => {
    const w = getReloadWeight(200, 1);
    // Should be between 120 and 130 (60-65% of 200)
    expect(w).toBeGreaterThanOrEqual(120);
    expect(w).toBeLessThanOrEqual(130);
  });

  it('week 2 → 70-75% of preDeloadWeight', () => {
    const w = getReloadWeight(200, 2);
    expect(w).toBeGreaterThanOrEqual(140);
    expect(w).toBeLessThanOrEqual(150);
  });

  it('week 3 → 80-85% of preDeloadWeight', () => {
    const w = getReloadWeight(200, 3);
    expect(w).toBeGreaterThanOrEqual(160);
    expect(w).toBeLessThanOrEqual(170);
  });

  it('week 4+ → same as week 3 (80-85%), normal progression resumes', () => {
    const w4 = getReloadWeight(200, 4);
    const w3 = getReloadWeight(200, 3);
    expect(w4).toBe(w3);
  });

  it('result is always rounded to nearest 5', () => {
    [1, 2, 3, 4].forEach(week => {
      const w = getReloadWeight(210, week);
      expect(w % 5).toBe(0);
    });
  });
});
