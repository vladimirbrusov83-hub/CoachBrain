// tests/suggestions.test.ts
// Integration tests — exercise the full CoachDecision pipeline end to end

import { describe, it, expect } from 'vitest';
import { getCoachDecision } from '../src/suggestions';
import { AthleteHistory, Session } from '../src/types';

// Build a realistic bench press session
function benchSession(
  weight: number,
  rir: number,
  date: string,
  overrides: Partial<Session> = {}
): Session {
  return {
    date,
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

describe('getCoachDecision — integration', () => {
  it('3 sessions bench press, avg 1.8 RIR → action=increase, deloadWarning=false', () => {
    const history: AthleteHistory = {
      sessions: [
        benchSession(185, 2, '2024-01-01'),
        benchSession(185, 2, '2024-01-08'),
        benchSession(185, 1, '2024-01-15'),
      ],
    };

    const decision = getCoachDecision(history, 'BB bench press');

    expect(decision.exercise).toBe('BB bench press');
    expect(decision.progression.action).toBe('increase');
    expect(decision.deloadWarning).toBe(false);
    expect(decision.deloadTriggered).toBe(false);

    // Should suggest higher weight
    expect(decision.progression.suggestedWeight).toBeGreaterThan(185);

    // Should have warmup sets (it's a compound)
    expect(decision.nextSession.warmupSets.length).toBeGreaterThan(0);

    // Should have working sets
    expect(decision.nextSession.workingSets.length).toBeGreaterThan(0);

    // Phase should be early (only 3 sessions)
    expect(decision.phase).toBe('early');
  });

  it('3 sessions, RIR trending toward 0 across 8+ sessions → deloadWarning=true', () => {
    // Build 8 sessions with decreasing RIR — simulating accumulated fatigue
    const sessions: Session[] = [
      benchSession(225, 3, '2024-01-01'),
      benchSession(225, 2, '2024-01-08'),
      benchSession(225, 2, '2024-01-15'),
      benchSession(230, 2, '2024-01-22'),
      benchSession(230, 1, '2024-01-29'),
      benchSession(230, 1, '2024-02-05'),
      // Last 3 sessions: near or at failure, avg < 1.5, one has RIR=0
      {
        date: '2024-02-12',
        status: 'completed',
        exercises: [{ name: 'BB bench press', sets: [
          { weight: 235, reps: 8, rir: 1 },
          { weight: 235, reps: 8, rir: 0 },
          { weight: 235, reps: 7, rir: 0 },
        ]}],
      },
      {
        date: '2024-02-19',
        status: 'completed',
        exercises: [{ name: 'BB bench press', sets: [
          { weight: 235, reps: 8, rir: 1 },
          { weight: 235, reps: 7, rir: 0 },
          { weight: 235, reps: 7, rir: 0 },
        ]}],
      },
      {
        date: '2024-02-26',
        status: 'completed',
        exercises: [{ name: 'BB bench press', sets: [
          { weight: 235, reps: 7, rir: 1 },
          { weight: 235, reps: 7, rir: 0 },
          { weight: 235, reps: 6, rir: 0 },
        ]}],
      },
    ];

    const history: AthleteHistory = { sessions };
    const decision = getCoachDecision(history, 'BB bench press');

    expect(decision.deloadWarning).toBe(true);
  });

  it('missed last session → action=hold, confidence=low', () => {
    const history: AthleteHistory = {
      sessions: [
        benchSession(185, 2, '2024-01-01'),
        benchSession(185, 2, '2024-01-08'),
        {
          ...benchSession(185, 2, '2024-01-15'),
          status: 'missed',
        },
      ],
    };

    const decision = getCoachDecision(history, 'BB bench press');

    expect(decision.progression.action).toBe('hold');
    expect(decision.progression.confidence).toBe('low');
  });

  it('returns correct lastSession data from history', () => {
    const history: AthleteHistory = {
      sessions: [
        benchSession(185, 2, '2024-01-01'),
        benchSession(195, 1, '2024-01-08'),
      ],
    };

    const decision = getCoachDecision(history, 'BB bench press');

    expect(decision.lastSession.date).toBe('2024-01-08');
    expect(decision.lastSession.weight).toBe(195);
    expect(decision.lastSession.sets).toBe(3);
    expect(decision.lastSession.reps).toBe(8);
    expect(decision.lastSession.avgRIR).toBe(1);
  });

  it('deloaded last session → action=hold, deload context preserved', () => {
    const history: AthleteHistory = {
      sessions: [
        benchSession(225, 2, '2024-01-01'),
        benchSession(225, 2, '2024-01-08'),
        {
          ...benchSession(95, 3, '2024-01-15'),
          isDeload: true,
        },
      ],
    };

    const decision = getCoachDecision(history, 'BB bench press');
    expect(decision.progression.action).toBe('hold');
    expect(decision.progression.reason).toMatch(/deload/i);
  });

  it('sessionsSinceDeload is calculated correctly', () => {
    const sessions: Session[] = [
      benchSession(185, 2, '2024-01-01'),
      benchSession(185, 2, '2024-01-08'),
      benchSession(185, 2, '2024-01-15'),
    ];

    const history: AthleteHistory = {
      sessions,
      lastDeloadDate: '2024-01-04', // between first and second session
    };

    const decision = getCoachDecision(history, 'BB bench press');
    // 2 sessions after Jan 4
    expect(decision.sessionsSinceDeload).toBe(2);
  });
});
