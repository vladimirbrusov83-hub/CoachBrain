import { describe, it, expect } from 'vitest';
import { classifyMovement } from '../src/utils';

describe('classifyMovement', () => {
  it('treats dumbbell presses as push work', () => {
    expect(classifyMovement('Dumbbell Press')).toBe('push');
    expect(classifyMovement('DB press')).toBe('push');
    expect(classifyMovement('Dumbbell Bench Press')).toBe('push');
  });
  it('keeps existing categories', () => {
    expect(classifyMovement('Back Squat')).toBe('lower');
    expect(classifyMovement('Close Grip Bench')).toBe('triceps');
    expect(classifyMovement('Barbell Row')).toBe('pull');
    expect(classifyMovement('Bicep Curl')).toBe('accessory');
  });
});
