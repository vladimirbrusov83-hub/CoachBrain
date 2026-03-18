// examples/basic-usage.ts
// Demonstrates how to use CoachBrain to get a full coaching decision for a single exercise.
// Run with: npx tsx examples/basic-usage.ts

import { getCoachDecision } from '../src/index';
import { AthleteHistory } from '../src/types';

// Step 1: Build an AthleteHistory object with real session data.
// In production this would come from your database or TrueCoach export.
const history: AthleteHistory = {
  // Bench press training block — 5 sessions, working up toward a progression trigger
  sessions: [
    {
      date: '2024-10-07',
      status: 'completed',
      sessionTitle: 'Day 1 — Upper',
      exercises: [
        {
          name: 'BB bench press',
          sets: [
            { weight: 195, reps: 8, rir: 3 },
            { weight: 195, reps: 8, rir: 3 },
            { weight: 195, reps: 8, rir: 2 },
          ],
          coachNote: 'Good session, stay here next week',
        },
      ],
    },
    {
      date: '2024-10-14',
      status: 'completed',
      sessionTitle: 'Day 1 — Upper',
      exercises: [
        {
          name: 'BB bench press',
          sets: [
            { weight: 195, reps: 8, rir: 2 },
            { weight: 195, reps: 8, rir: 2 },
            { weight: 195, reps: 8, rir: 2 },
          ],
        },
      ],
    },
    {
      date: '2024-10-21',
      status: 'completed',
      sessionTitle: 'Day 1 — Upper',
      exercises: [
        {
          name: 'BB bench press',
          sets: [
            { weight: 195, reps: 8, rir: 2 },
            { weight: 195, reps: 8, rir: 1 },
            { weight: 195, reps: 8, rir: 1 },
          ],
        },
      ],
    },
    {
      date: '2024-10-28',
      status: 'completed',
      sessionTitle: 'Day 1 — Upper',
      exercises: [
        {
          name: 'BB bench press',
          sets: [
            { weight: 195, reps: 8, rir: 1 },
            { weight: 195, reps: 8, rir: 1 },
            { weight: 195, reps: 8, rir: 1 },
          ],
        },
      ],
    },
    {
      date: '2024-11-04',
      status: 'completed',
      sessionTitle: 'Day 1 — Upper',
      exercises: [
        {
          name: 'BB bench press',
          sets: [
            { weight: 195, reps: 8, rir: 2 },
            { weight: 195, reps: 8, rir: 1 },
            { weight: 195, reps: 8, rir: 1 },
          ],
          coachNote: 'Feeling strong — ready to jump',
        },
      ],
    },
  ],
  // Athlete returned from deload before this block started
  lastDeloadDate: '2024-09-30',
};

// Step 2: Call getCoachDecision() with the history and exercise name.
// This runs all 5 rules internally and returns a complete CoachDecision.
const decision = getCoachDecision(history, 'BB bench press');

// Step 3: Log the full output — in a real app you'd pass this to your UI layer
console.log('=== CoachBrain Decision ===\n');
console.log(`Exercise:              ${decision.exercise}`);
console.log(`Training phase:        ${decision.phase}`);
console.log(`Sessions since deload: ${decision.sessionsSinceDeload}`);
console.log('');

console.log('--- Last Session ---');
console.log(`  Date:    ${decision.lastSession.date}`);
console.log(`  Weight:  ${decision.lastSession.weight} lbs`);
console.log(`  Sets:    ${decision.lastSession.sets}`);
console.log(`  Reps:    ${decision.lastSession.reps}`);
console.log(`  Avg RIR: ${decision.lastSession.avgRIR ?? 'not recorded'}`);
console.log('');

console.log('--- Progression ---');
console.log(`  Action:    ${decision.progression.action}`);
console.log(`  Suggested: ${decision.progression.suggestedWeight} lbs (+${decision.progression.increment})`);
console.log(`  Confidence: ${decision.progression.confidence}`);
console.log(`  Reason:    ${decision.progression.reason}`);
console.log('');

console.log('--- Next Session ---');
console.log(`  Working sets: ${decision.nextSession.suggestedSets} × ${decision.nextSession.suggestedReps} @ ${decision.progression.suggestedWeight} lbs`);
console.log('  Warmup plan:');
decision.nextSession.warmupSets.forEach((s, i) => {
  console.log(`    Set ${i + 1}: ${s.weight} lbs × ${s.reps} reps`);
});
console.log('');

console.log('--- Fatigue Signals ---');
console.log(`  Deload warning:   ${decision.deloadWarning}`);
console.log(`  Deload triggered: ${decision.deloadTriggered}`);
