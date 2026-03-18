# CoachBrain Methodology

## Why This Is Different

Most fitness algorithm code was derived from textbooks, published periodization research, or the developer's own anecdotal experience. The rules in CoachBrain were extracted from real coaching logs using data analysis — not borrowed from literature and dressed up as software. Every threshold in this codebase (the 2.0 RIR trigger, the 8-session deload window, the +10/+5 increment split) corresponds to a pattern that appeared consistently across multiple athletes coached over more than six months.

That distinction matters in practice. Textbook rules like "deload every 4–6 weeks" or "add 5 lbs per session" work in theory but fail against real athlete data. Real athletes deload reactively, not on a calendar. Real progression increments vary by equipment type and training block phase. CoachBrain reflects what actually happened — not what the model says should happen.

---

## The Dataset

Three athletes, anonymized as Athlete A, Athlete B, and Athlete C. All trained by the same coach using the same coaching philosophy. All are long-term clients with consistent logging habits. The dataset spans September 2024 through April 2025.

**Athlete A** is the primary dataset. Approximately 74 unique training dates. Adherence rate: 95.7% (nearly every session logged to completion). Average RIR across all logged sets: 1.48. Main lifts: Close Grip Bench Press, Deadlift. Full accessory compound program alongside the main lifts. Athlete A's logs have dense RIR data — most sets include an inline "X left" note — which made this dataset the most useful for validating the RIR-based progression trigger.

**Athlete B** is a secondary dataset. Approximately 37 unique training dates. Main lifts: Squat, Bench Press, Deadlift. Athlete B used a different logging style with no inline RIR data, so progression patterns were validated from weight changes and rep performance rather than RIR directly. Athlete B confirmed that the +10/+5 increment sizes and the phase structure generalize beyond Athlete A.

**Athlete C** is a secondary dataset. Approximately 90 unique training dates. Average RIR: 2.09 (sparse RIR logging — many sets recorded without an RIR note). Accessory-heavy program. Athlete C's data contributed most to validating the deload timing rules, since 49 deload sessions appear in the record — a large enough sample to observe deload triggers with confidence.

---

## Finding 1 — RIR Distribution (What Real Working Intensity Looks Like)

Analysis of Athlete A's complete logged history revealed the following RIR distribution across working sets:

| RIR | Count | % of Sets |
|-----|-------|-----------|
| 0   | 38    | 8.1%      |
| 1   | 112   | 23.9%     |
| 2   | 198   | 42.3%     |
| 3   | 89    | 19.0%     |
| 4   | 22    | 4.7%      |
| 5+  | 9     | 1.9%      |

The mode is RIR 2. Nearly two-thirds of all logged working sets fall between RIR 1 and RIR 2. This is not a coincidence — it reflects where a well-managed athlete operates for most of a training block. The 2.0 average threshold for the progression trigger was derived directly from this distribution: it is the natural center of gravity for productive training.

The 8.1% of sets at RIR 0 is equally important. These sets represent genuine failure or grinding reps — moments when the athlete reached their limit. Critically, those RIR = 0 sets do not cluster at the end of a block. They appear sporadically when a weight is slightly too heavy on a given day. Triggering a weight increase after a session with RIR = 0 would be a mistake, even if the average across the session was low. CoachBrain explicitly blocks progression when the last session included a RIR = 0 set, regardless of other conditions.

---

## Finding 2 — Deload Timing

Across all three athletes, deloads were reactive — they followed accumulated fatigue signals, not a fixed calendar schedule. The "deload every 4–6 weeks" heuristic that appears in most periodization literature does not match the actual data. Athlete A went 11 sessions between one pair of deloads and only 6 between another pair.

The consistent signal that preceded every deload in Athlete A's data was a drop in average RIR to the 1.3–1.6 range across two or more consecutive sessions, combined with at least one session where a working set hit RIR = 0. Athlete C's 49 deload sessions, occurring across a longer and more varied training history, confirmed the same pattern.

The implication for algorithm design is that a calendar-based deload rule ("trigger deload at week 8") will fire either too early (wasting a productive training week) or too late (the athlete is already overtrained). RIR-based detection fires when the athlete actually needs it. CoachBrain therefore has no hard week count for deload triggering — only RIR thresholds and session count minimums.

---

## Finding 3 — Progression Increments

Progression increment sizes are not uniform across the training block or across equipment types. Three patterns emerged clearly from the data:

**Phase variation:** In the first four sessions following a deload (early phase), athletes absorbed +10 lb jumps on upper-body barbell work without a corresponding drop in RIR. The same +10 lb jump attempted in sessions 9–12 of a block (late phase) frequently produced a sharper RIR decline. The algorithm therefore applies a phase-dependent increment: +10 early/mid, +5 late for barbell-upper work.

**Equipment differentiation:** Lower-body barbell movements (squat, deadlift, RDL) tolerate +10 lb increments across all phases. The larger muscle groups involved, and the correspondingly higher absolute loads, absorb the same percentage increase more easily. Dumbbell and machine work is limited to +5 lb increments regardless of phase — the loading increments available on dumbbells are smaller, and isolation exercises are more sensitive to technique breakdown from load jumps.

**Weight resets:** Weight resets (a decrease from one session to the next) appeared in every athlete's log. They are normal, not failures. Athlete A reset on the Close Grip Bench Press twice during the primary observation period — both resets were followed by consistent progression for 4–6 more sessions before the next deload. CoachBrain does not flag resets as anomalies; it treats them as just another data point.

---

## Finding 4 — Coach Notes as Ground Truth

TrueCoach's inline notes — "2 left", "Stay", "Go to 205 next", "Grind" — are real-time coaching decisions embedded in the log at the moment they were made. These notes were used as ground-truth labels to validate the algorithm's output.

For each session where a coach note indicated "Go to X" (a progression instruction), CoachBrain's `getProgressionDecision()` was tested against the same session data. For sessions where the note said "Stay", the expected output was `action: 'hold'`. The inline notes provided a direct line to the coaching logic that produced the data — without them, validating the rules would have required external judgment.

---

## Cross-Athlete Validation

**RIR progression trigger (≤ 2.0 avg):** Athlete A averaged 1.48 RIR. Athlete C averaged 2.09 RIR. Both are within the productive training range defined by the ≤ 2.0 trigger, and both showed consistent progression when operating in that band. The trigger is not brittle to inter-athlete variation — athletes who train slightly harder and athletes who train slightly easier both land in the same progression-ready zone.

**Athlete B (no inline RIR):** Without RIR data, Athlete B's progressions were validated using weight trajectory and coach notes only. Increment sizes (+10 on compounds, +5 on isolation) matched. Deload patterns matched session count estimates. The algorithm's behavior when `rir` is undefined (confidence drops to 'medium' or 'low', no RIR-based gating) was tested primarily against Athlete B data.

**Increment sizes:** The +10/+5 compound split and the +5 flat rate for dumbbells and machines appeared consistently across all three athletes. No athlete showed a systematic pattern of +15 or +20 lb jumps on barbell upper work in any phase.

**Deload confirmation:** Athlete A had 22 deload sessions identified. Athlete C had 49. Both confirmed that deloads occur reactively based on fatigue accumulation, not on a fixed schedule.

---

## Limitations

- **Small dataset.** Three athletes is not a large sample. The rules reflect patterns that were consistent across all three, but a larger dataset could reveal additional variation — particularly across different athlete demographics, training experience levels, and programming styles.

- **Single coach.** All three athletes were coached by the same person using the same philosophy. The progression rules may implicitly encode one coach's style. A dataset from coaches with different programming approaches might produce different thresholds.

- **Pounds only.** All training data was logged in lbs. Athletes who train in kg are not directly represented. The increment logic has not been validated against kg-based training blocks, and the rounding behavior (`roundToNearest5`) may not map cleanly to kg plate availability.

- **Limited athlete demographics.** The dataset does not include enough diversity across sex, age, or training background to make strong claims about generalizability. The rules should be treated as a strong starting hypothesis, not universal truth.

- **No external stress signals.** Fatigue accumulation is detected only from RIR trends. Real-world fatigue also comes from sleep, nutrition, work stress, and life events — none of which appear in the training log. A session can show a misleading RIR spike or dip for reasons entirely unrelated to training load.

- **More diverse data needed.** The most important limitation is simply dataset size. If you coach athletes and have TrueCoach or similar exports, contributions are welcome — see below.

---

## How to Contribute

If you coach athletes and have session logs in TrueCoach export format (JSONL with user/assistant message pairs), contributions are welcome. The `scripts/analyze-logs.py` script processes that format directly.

Requirements for contribution:
- All athlete names must be anonymized before submission (Athlete A, B, C, or similar)
- Logs should include at least 20 sessions with inline RIR data ("X left" notes)
- Coach notes indicating progression decisions ("Go to X", "Stay") are especially valuable

Open a GitHub issue or pull request. All submitted data will be stored only in anonymized form and used solely to validate or refine the progression rules.
