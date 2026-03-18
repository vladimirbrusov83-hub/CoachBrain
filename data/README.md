# Data

## What this is

Sample training session data used to validate CoachBrain's progression rules.

## Anonymization

All athletes are identified only as Athlete A, Athlete B, and Athlete C. No real names, handles, or identifying information appear anywhere in this repository. The coach who generated this data has explicitly approved its use.

## Format

Each file is a JSON array of `Session` objects matching the `Session` type from `src/types.ts`. Fields:

- `date`: ISO 8601 string
- `status`: `"completed"` or `"missed"`
- `sessionTitle`: optional label (e.g. "Day 1", "Upper A")
- `isDeload`: boolean, present only on deload sessions
- `exercises`: array of `ExerciseEntry` objects, each containing:
  - `name`: exercise name as logged
  - `sets`: array of `WorkingSet` with `weight` (lbs), `reps`, and optional `rir`
  - `coachNote`: inline coaching note from the original log (e.g. "Go to 205 next", "Stay")

## Files

- `athlete-a-sample.json`: 20 sessions representing a complete training block for Athlete A. Includes a full progression arc, a near-deload period (RIR dropping toward 0), two deload sessions, and a three-week reload. Main lifts: Close Grip Bench Press and Deadlift.

## Usage

Load the file and pass it to `getCoachDecision()`:

```typescript
import sessions from '../data/athlete-a-sample.json';
import { getCoachDecision } from '../src/index';

const history = { sessions, lastDeloadDate: '2024-09-16' };
const decision = getCoachDecision(history, 'Close Grip Bench Press');
```
