# CoachBrain Methodology

## Why This Is Different

Most fitness algorithm code was derived from textbooks, published periodization research, or the developer's own anecdotal experience. The rules in CoachBrain were extracted from real coaching logs using data analysis — not borrowed from literature and dressed up as software. Every threshold in this codebase (the progression trigger, the 8-session deload window, the increment sizes) corresponds to a pattern that appeared consistently across multiple athletes coached over more than six months.

That distinction matters in practice. Textbook rules like "deload every 4–6 weeks" or "add 5 lbs per session" work in theory but fail against real athlete data. Real athletes deload reactively, not on a calendar. Real progression increments vary by movement and training context. CoachBrain reflects what actually happened — not what the model says should happen.

> **Implementation update (2026-06-25).** The engine was re-derived from the expanded, unit-normalized CoachDecisions analysis (15 athletes, 6,276 sessions). Two original thresholds were **superseded** to match what the data actually shows:
> - **Progression trigger.** v1's code increased only when the athlete ground down to ≤ 2.0 RIR. The coach actually adds load while the athlete still has reserve (~2–3 RIR) once the weight has been held for the category's wait window. The engine now increases on `reserve ≥ ~2 RIR + wait-window met`, and *holds to consolidate* only near failure (≤ 1 RIR). (This is the rule already described conceptually in "Reconciling the two RIR findings" below — the code now implements it.)
> - **Increment sizes.** v1's `+10 / +5` split was a pounds artifact: the "heaviest lifters" who appeared to use 10 kg were logging on a 45 **lb** bar (10 lb ≈ 4.5 kg). After normalization there is no 10 kg tier. The engine now uses **5 kg for lower-body, 2.5 kg for upper/accessory**, by movement category — not by equipment or block phase. Leg press is treated as volume-only (never load-driven). All weights are kg.
>
> Sections below written before this date describe the v1 thresholds; where they conflict, this note and the code are authoritative.

---

## The Dataset

### Original dataset (CoachBrain v1)

Three athletes, anonymized as Athlete A, Athlete B, and Athlete C. All trained by the same coach using the same coaching philosophy. All are long-term clients with consistent logging habits. The dataset spans September 2024 through April 2025.

**Athlete A** is the primary dataset. Approximately 74 unique training dates. Adherence rate: 95.7% (nearly every session logged to completion). Average RIR across all logged sets: 1.48. Main lifts: Close Grip Bench Press, Deadlift. Full accessory compound program alongside the main lifts. Athlete A's logs have dense RIR data — most sets include an inline "X left" note — which made this dataset the most useful for validating the RIR-based progression trigger.

**Athlete B** is a secondary dataset. Approximately 37 unique training dates. Main lifts: Squat, Bench Press, Deadlift. Athlete B used a different logging style with no inline RIR data, so progression patterns were validated from weight changes and rep performance rather than RIR directly. Athlete B confirmed that the +10/+5 increment sizes and the phase structure generalize beyond Athlete A.

**Athlete C** is a secondary dataset. Approximately 90 unique training dates. Average RIR: 2.09 (sparse RIR logging — many sets recorded without an RIR note). Accessory-heavy program. Athlete C's data contributed most to validating the deload timing rules, since 49 deload sessions appear in the record — a large enough sample to observe deload triggers with confidence.

### Expanded dataset (CoachDecisions analysis)

In a subsequent analysis using the CoachDecisions pipeline (`~/Documents/CoachDecisions/`), the full coaching log for the same coach was parsed across **13 athletes and 5,775 sessions**, spanning December 2021 through May 2026. All athletes were coached by the same person using the same programming philosophy. This dataset directly addresses the "small dataset" and "pounds only" limitations noted in the original CoachBrain methodology — the majority of athletes in the expanded set train in kg.

| Athlete | Sessions | Completion rate | Avg sessions before weight increase |
|---|---|---|---|
| Athlete D | 246 | 90% | 2.0 |
| Athlete E | 483 | 82% | 2.4 |
| Athlete F | 143 | 68% | 3.8 |
| Athlete G | 744 | 95% | 2.3 |
| Athlete H | 493 | — | 2.5 |
| Athlete I | 690 | — | 2.4 |
| Athlete J | 567 | — | 1.8 |
| Athlete K | 463 | — | 2.3 |
| Athlete L | 495 | — | 2.8 |
| Athlete M | 269 | — | 2.6 |
| Athlete N | 580 | — | 2.7 |
| Athlete O | 395 | — | 3.3 |
| Athlete P | 207 | — | 2.6 |

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

## Finding 5 — Weight Increase Trigger: RIR Before the Jump

The original dataset established that athletes *operate* at approximately 2.0 RIR during productive training blocks. The expanded dataset answers a different but related question: what RIR does the athlete report *immediately before the coach increases their weight*?

Across 63 confirmed weight increase events with documented pre-increase RIR data (from the expanded 13-athlete dataset):

| RIR before increase | Count | % |
|---|---|---|
| 1 | 1 | 2% |
| 2 | 23 | 37% |
| 3 | 27 | 43% |
| 4 | 5 | 8% |
| 5 | 4 | 6% |
| 6+ | 3 | 5% |

Average RIR before a weight increase: **3.17** (median: 3).

This refines the progression trigger. An athlete at 2.0 RIR is in the productive training zone. An athlete reporting 3+ RIR for one or more sessions is showing clear capacity to absorb more load — that is when the coach acts. The two findings are compatible: the athlete trains at ~2 RIR, and when they surface above 3 RIR, the coach increases weight.

The practical implication: the threshold for triggering a weight increase is not "operating below 2.0 RIR" but "consistently above 3.0 RIR." These describe opposite ends of the same decision: an athlete at 1.5 RIR is working hard enough to keep the weight; an athlete at 3+ RIR has headroom that the coach should use.

---

## Finding 6 — Sessions at Same Weight Before Increase

The expanded dataset also quantifies how long the coach *waits* before acting on a progression signal. Across all 13 athletes:

- **Average sessions at the same weight before a jump: 2.45** (median: 2)
- The coach rarely increases weight after a single session showing extra capacity — one good session is treated as noise
- Two consecutive sessions with available RIR headroom is the de facto trigger point

This varies by exercise category:

| Category | Avg sessions before increase |
|---|---|
| Lower body (squat, DL, lunge, RDL) | 2.35 |
| Push (bench, press, fly) | 2.46 |
| Pull (row, pulldown, pullup) | 2.56 |
| Triceps | 3.05 |
| Accessory / isolation | 3.27 |

The coach is more patient with isolation and accessory work than with compound movements. Compound lifts get increased as soon as capacity is established; accessories are held longer, likely because small load changes on isolation exercises affect technique more acutely.

---

## Finding 7 — Increment Sizes Validated in kg

The original methodology was derived from lb-based logs. The expanded dataset, which is predominantly kg-based, confirms the increment structure translates directly:

| Increment | Occurrences | % of increases |
|---|---|---|
| 5 kg | 2,915 | 60% |
| 10 kg | 1,380 | 28% |
| 2.5 kg | 333 | 7% |
| 15 kg | 326 | 7% |

**5 kg is the universal standard.** It appears as the most common increment for every athlete in the dataset regardless of training level or primary lifts.

**10 kg** is used for stronger athletes on heavier lifts. The athletes who use 10 kg as their primary increment are also the heaviest lifters in the dataset (deadlift peaks at 355 kg and 285 kg respectively).

**2.5 kg** is the fine-tuning increment — used when 5 kg would overshoot, typically on smaller isolation exercises or for athletes who are close to a rep PR ceiling.

The original +10/+5 lb split (≈4.5/2.3 kg) maps approximately onto the 5/2.5 kg pattern observed in kg-based training. The principle holds; the exact plate increment reflects what is available in each gym.

---

## Finding 8 — Exercise-Specific Roles

Not all exercises are used for the same purpose. Across all 13 athletes, one exercise showed consistent behavior that distinguishes it from the rest:

**Seated leg curls — treated as a real progression lift.** Average total gain: +27 kg. Consistent jump size: ~15 kg. Used across all 13 athletes with active loading progression. Unlike most accessory exercises, leg curls receive the same progression attention as compound movements.

**Lower back injury is the most common training disruption.** Across all 13 athletes, lower back flags accounted for more injury incidents than all other body parts combined. The coach's consistent response: skip or defer the deadlift, substitute goblet squat for the hip-hinge pattern, cue eccentric control. This is a recurring, predictable decision tree that can be encoded directly.

---

## Finding 9 — Adherence and Progression Are Correlated

Athletes with higher session completion rates show faster loading progression (fewer sessions at the same weight before an increase). The two extremes in the dataset:

- **Athlete J**: 1.8 sessions before increase (fastest), high attendance
- **Athlete F**: 3.8 sessions before increase (slowest), 32% missed sessions

This is directionally expected — missed sessions break the performance signal the coach uses to decide when to increase weight. An athlete who misses every other session gives the coach less data to act on, producing longer waits before progression. CoachBrain should account for session gaps when assessing progression readiness.

---

## Cross-Athlete Validation

### Original 3-athlete validation

**RIR progression trigger (≤ 2.0 avg):** Athlete A averaged 1.48 RIR. Athlete C averaged 2.09 RIR. Both are within the productive training range defined by the ≤ 2.0 trigger, and both showed consistent progression when operating in that band. The trigger is not brittle to inter-athlete variation — athletes who train slightly harder and athletes who train slightly easier both land in the same progression-ready zone.

**Athlete B (no inline RIR):** Without RIR data, Athlete B's progressions were validated using weight trajectory and coach notes only. Increment sizes (+10 on compounds, +5 on isolation) matched. Deload patterns matched session count estimates. The algorithm's behavior when `rir` is undefined (confidence drops to 'medium' or 'low', no RIR-based gating) was tested primarily against Athlete B data.

**Increment sizes:** The +10/+5 compound split and the +5 flat rate for dumbbells and machines appeared consistently across all three athletes. No athlete showed a systematic pattern of +15 or +20 lb jumps on barbell upper work in any phase.

**Deload confirmation:** Athlete A had 22 deload sessions identified. Athlete C had 49. Both confirmed that deloads occur reactively based on fatigue accumulation, not on a fixed schedule.

### Expanded 13-athlete validation

**RIR trigger (≤ 2.0 working, ~3.0 before increase):** Confirmed across all athletes with RIR data. The productive training zone (≤ 2.0 average RIR) holds. The weight increase trigger (~3.0 RIR pre-jump) is a new, more precise finding layered on top.

**Increment sizes in kg:** ~~10 kg as primary confirmed for the heaviest lifters.~~ **Superseded by the 2026-06-25 unit-normalized re-analysis (15 athletes).** The apparent 10 kg tier was a pounds artifact: the "heaviest lifters" (Eric, Scott) logged on a 45 **lb** bar, so their 10 lb steps (≈ 4.5 kg) read as "10." After normalizing every set to kg, common increments collapse to a tight **2.5 / 4.5 / 5 kg** band with no 10 kg standard (4.5 kg is simply 10 lb converted). The faithful encoding is **5 kg lower-body, 2.5 kg upper/accessory**.

**Deload timing:** Reactive deloading confirmed across all 13 athletes. Observed cycle range: **6 to 10 weeks** — consistent with the original sample and confirming that deloads occur within this window when RIR signals accumulate. CoachBrain's RIR-based deload detection handles this correctly; a fixed calendar trigger would not.

**Exercise roles:** Seated leg curls as a progression lift holds across all 13 athletes — not an artifact of any one athlete's programming.

---

## Limitations

- **Small dataset (partially addressed).** The original 3-athlete dataset has been expanded to 13 athletes and 5,775 sessions through the CoachDecisions analysis. The core rules (RIR trigger, increment sizes, reactive deloading) now have substantially more support. Remaining gaps: diversity of training backgrounds, demographics, and experience levels is still limited.

- **Single coach.** All athletes were coached by the same person using the same philosophy. This is the most significant remaining limitation. The rules encode one coach's style with high fidelity — but a different coach with different thresholds would produce different data. CoachBrain should be treated as a model of this coach's decision-making, not a universal training algorithm.

- **Pounds only (resolved for kg).** The original dataset was lb-only. The expanded dataset is predominantly kg-based. The 5 kg / 10 kg increment pattern has been confirmed across 11 of 13 kg-training athletes. The `roundToNearest5` logic applies directly to kg. This limitation is now substantially resolved.

- **Limited athlete demographics.** The dataset skews toward a specific type of client — motivated, long-term gym members with consistent logging habits. Adherence rates across the expanded dataset range from 68% to 95%. Athletes who miss sessions frequently or who are beginners are underrepresented.

- **No external stress signals.** Fatigue is detected only from RIR trends in the training log. Sleep, nutrition, life stress, and illness do not appear. A session can show misleading RIR values for reasons entirely outside the training context.

- **RIR data sparsity.** Many sessions have no RIR annotation. The expanded dataset analysis was limited to 63 confirmed pre-increase RIR data points across 5,775 sessions — roughly 1%. The RIR trigger finding is directionally strong but would benefit from denser annotation.

- **Exercise name normalization.** The CoachDecisions pipeline identifies exercises by name string matching. Spelling variation ("mashine" vs "machine"), equipment variation (same movement on different machines), and naming drift over time mean that some exercise threads are split or incorrectly merged. This introduces noise into the per-exercise progression statistics.

---

## How to Contribute

If you coach athletes and have session logs in TrueCoach export format (JSONL with user/assistant message pairs), contributions are welcome. The `scripts/analyze-logs.py` script processes that format directly.

Requirements for contribution:
- All athlete names must be anonymized before submission (Athlete A, B, C, or similar)
- Logs should include at least 20 sessions with inline RIR data ("X left" notes)
- Coach notes indicating progression decisions ("Go to X", "Stay") are especially valuable

Open a GitHub issue or pull request. All submitted data will be stored only in anonymized form and used solely to validate or refine the progression rules.
