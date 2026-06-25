// tests/progression.test.ts
// Asserts the DISTILLED coaching rules (CoachDecisions, 15 athletes), not the v1 thresholds:
//   • increase when reserve ≥ ~2 RIR AND the weight has been held for the category wait window
//   • consolidate (hold) near failure (≤ 1 RIR)
//   • increment 5 kg lower-body / 2.5 kg upper+accessory
//   • leg press is volume-only — never progressed
// All weights in kg.

import { describe, it, expect } from 'vitest';
import { getProgressionDecision } from '../src/progression';
import { AthleteHistory, Session } from '../src/types';

// Build a session for a named exercise at a given top weight + RIR
function exSession(
  name: string,
  weight: number,
  rir: number | undefined,
  overrides: Partial<Session> = {}
): Partial<Session> {
  return {
    status: 'completed',
    exercises: [
      {
        name,
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

function buildHistory(sessions: Partial<Session>[], lastDeloadDate?: string): AthleteHistory {
  const full: Session[] = sessions.map((s, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    status: 'completed',
    exercises: [],
    ...s,
  }));
  return { sessions: full, lastDeloadDate };
}

describe('getProgressionDecision — distilled rules', () => {
  // ── Increase trigger (reserve + wait window) ─────────────────────────────────
  it('lower-body: 2 sessions held at weight with ~2 RIR → increase +5 kg', () => {
    const h = buildHistory([exSession('squat', 100, 2), exSession('squat', 100, 2)]);
    const r = getProgressionDecision(h, 'squat');
    expect(r.action).toBe('increase');
    expect(r.increment).toBe(5);
    expect(r.suggestedWeight).toBe(105);
  });

  it('upper-body: 2 sessions held at weight with ~2 RIR → increase +2.5 kg', () => {
    const h = buildHistory([exSession('BB bench press', 80, 2), exSession('BB bench press', 80, 2)]);
    const r = getProgressionDecision(h, 'BB bench press');
    expect(r.action).toBe('increase');
    expect(r.increment).toBe(2.5);
    expect(r.suggestedWeight).toBe(82.5);
  });

  it('plenty of reserve (RIR 4) with wait window met → still increase (load too light)', () => {
    const h = buildHistory([exSession('BB bench press', 80, 4), exSession('BB bench press', 80, 4)]);
    const r = getProgressionDecision(h, 'BB bench press');
    expect(r.action).toBe('increase');
  });

  // ── Wait window ───────────────────────────────────────────────────────────────
  it('weight changed last session (held only 1) → hold, wait window not met', () => {
    const h = buildHistory([exSession('BB bench press', 80, 2), exSession('BB bench press', 82.5, 2)]);
    const r = getProgressionDecision(h, 'BB bench press');
    expect(r.action).toBe('hold');
    expect(r.reason).toMatch(/session.*at this weight|wait/i);
  });

  it('triceps waits 3 sessions: 2 held → hold, 3 held → increase', () => {
    const two = buildHistory([
      exSession('Triceps pushdown', 30, 2),
      exSession('Triceps pushdown', 30, 2),
    ]);
    expect(getProgressionDecision(two, 'Triceps pushdown').action).toBe('hold');

    const three = buildHistory([
      exSession('Triceps pushdown', 30, 2),
      exSession('Triceps pushdown', 30, 2),
      exSession('Triceps pushdown', 30, 2),
    ]);
    const r3 = getProgressionDecision(three, 'Triceps pushdown');
    expect(r3.action).toBe('increase');
    expect(r3.increment).toBe(2.5);
  });

  // ── Consolidate near failure ────────────────────────────────────────────────
  it('last session at 1 RIR → hold to consolidate (near failure)', () => {
    const h = buildHistory([exSession('squat', 100, 2), exSession('squat', 100, 1)]);
    const r = getProgressionDecision(h, 'squat');
    expect(r.action).toBe('hold');
    expect(r.reason).toMatch(/near failure|consolidate/i);
  });

  it('last session at 0 RIR (failure) → hold', () => {
    const h = buildHistory([exSession('squat', 100, 2), exSession('squat', 100, 0)]);
    expect(getProgressionDecision(h, 'squat').action).toBe('hold');
  });

  it('grinding last session overrides a 2-session average ≥ 2 → hold', () => {
    // avg(3,1) = 2, but the most recent session is at 1 RIR → consolidate
    const h = buildHistory([exSession('squat', 100, 3), exSession('squat', 100, 1)]);
    expect(getProgressionDecision(h, 'squat').action).toBe('hold');
  });

  // ── Leg press: volume-only ────────────────────────────────────────────────────
  it('leg press never progresses on load, even with wait window + reserve', () => {
    const h = buildHistory([
      exSession('Leg Press', 200, 3),
      exSession('Leg Press', 200, 3),
      exSession('Leg Press', 200, 3),
    ]);
    const r = getProgressionDecision(h, 'Leg Press');
    expect(r.action).toBe('hold');
    expect(r.reason).toMatch(/volume/i);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────
  it('currently in a deload week → hold', () => {
    const h = buildHistory([
      exSession('BB bench press', 80, 2),
      exSession('BB bench press', 80, 2, { isDeload: true }),
    ]);
    const r = getProgressionDecision(h, 'BB bench press');
    expect(r.action).toBe('hold');
    expect(r.reason).toMatch(/deload/i);
  });

  it('missed last session → hold, low confidence', () => {
    const h = buildHistory([
      exSession('BB bench press', 80, 2),
      exSession('BB bench press', 80, 2, { status: 'missed' }),
    ]);
    const r = getProgressionDecision(h, 'BB bench press');
    expect(r.action).toBe('hold');
    expect(r.confidence).toBe('low');
  });

  it('only 1 completed session → insufficient_data', () => {
    const h = buildHistory([exSession('BB bench press', 80, 2)]);
    expect(getProgressionDecision(h, 'BB bench press').action).toBe('insufficient_data');
  });

  it('no RIR data → hold and ask to log RIR', () => {
    const h = buildHistory([
      exSession('BB bench press', 80, undefined),
      exSession('BB bench press', 80, undefined),
    ]);
    const r = getProgressionDecision(h, 'BB bench press');
    expect(r.action).toBe('hold');
    expect(r.reason).toMatch(/RIR/i);
  });
});
