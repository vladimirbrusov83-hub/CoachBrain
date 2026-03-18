// tests/warmup.test.ts

import { describe, it, expect } from 'vitest';
import { getWarmupSets } from '../src/warmup';

describe('getWarmupSets — compound lifts', () => {
  it('bench press 225 lbs → full 5-set ladder', () => {
    const sets = getWarmupSets(225, 'BB bench press');
    expect(sets).toHaveLength(5);
    // Set 1: bar
    expect(sets[0].weight).toBe(45);
    expect(sets[0].reps).toBe(10);
    // Set 2: 40% of 225 = 90
    expect(sets[1].weight).toBe(90);
    expect(sets[1].reps).toBe(8);
    // Set 3: 60% of 225 = 135
    expect(sets[2].weight).toBe(135);
    expect(sets[2].reps).toBe(5);
    // Set 4: 75% of 225 = 170 (rounded to 170)
    expect(sets[3].weight).toBe(170);
    expect(sets[3].reps).toBe(3);
    // Set 5: 85% of 225 = 190 (rounded to 190)
    expect(sets[4].weight).toBe(190);
    expect(sets[4].reps).toBe(2);
  });

  it('bench press 90 lbs (< 95) → only 3 sets (no sets 4 and 5)', () => {
    const sets = getWarmupSets(90, 'BB bench press');
    // Below 95 lbs: skip sets 4 and 5 (would be too close to working weight)
    expect(sets).toHaveLength(3);
    expect(sets[0].weight).toBe(45); // bar
    expect(sets[1].reps).toBe(8);   // 40% set
    expect(sets[2].reps).toBe(5);   // 60% set
  });

  it('bench press 120 lbs (between 95 and 135) → 3 sets (skips sets 4 and 5)', () => {
    // 95 ≤ W < 135: skip set 5 only per spec... but re-reading:
    // "If W < 95 lbs: skip sets 4 and 5 / If W < 135 lbs: skip set 5 only"
    // So 120 lbs: skip set 5 only → 4 sets
    const sets = getWarmupSets(120, 'BB bench press');
    expect(sets).toHaveLength(4);
    expect(sets[0].weight).toBe(45);
    expect(sets[3].reps).toBe(3); // set 4 at 75%
  });

  it('deadlift counts as compound lift → multi-set ladder', () => {
    const sets = getWarmupSets(315, 'deadlift');
    expect(sets.length).toBeGreaterThanOrEqual(4);
    expect(sets[0].weight).toBe(45);
  });

  it('all weights are rounded to nearest 5', () => {
    const sets = getWarmupSets(225, 'squat');
    sets.forEach(s => {
      expect(s.weight % 5).toBe(0);
    });
  });

  it('close grip bench press counts as compound', () => {
    const sets = getWarmupSets(225, 'close grip bench press');
    expect(sets.length).toBeGreaterThanOrEqual(4);
    expect(sets[0].weight).toBe(45);
  });
});

describe('getWarmupSets — isolation / machine lifts', () => {
  it('leg extension → 2-set isolation warmup', () => {
    const sets = getWarmupSets(100, 'leg extension');
    expect(sets).toHaveLength(2);
    // Set 1: 50% of 100 = 50
    expect(sets[0].weight).toBe(50);
    expect(sets[0].reps).toBe(12);
    // Set 2: 70% of 100 = 70
    expect(sets[1].weight).toBe(70);
    expect(sets[1].reps).toBe(8);
  });

  it('cable fly → 2-set isolation warmup', () => {
    const sets = getWarmupSets(40, 'cable fly');
    expect(sets).toHaveLength(2);
  });

  it('DB curl → 2-set isolation warmup', () => {
    // DB is dumbbell but the warmup category uses lift pattern, not LiftType
    // DB curl has no compound movement pattern → isolation warmup
    const sets = getWarmupSets(30, 'DB curl');
    expect(sets).toHaveLength(2);
  });
});

describe('getWarmupSets — bodyweight lifts', () => {
  it('pull-ups → empty array (no warmup sets)', () => {
    const sets = getWarmupSets(0, 'pull-ups');
    expect(sets).toHaveLength(0);
  });

  it('dips → empty array', () => {
    const sets = getWarmupSets(0, 'dips');
    expect(sets).toHaveLength(0);
  });

  it('push-ups → empty array', () => {
    const sets = getWarmupSets(0, 'push-ups');
    expect(sets).toHaveLength(0);
  });
});
