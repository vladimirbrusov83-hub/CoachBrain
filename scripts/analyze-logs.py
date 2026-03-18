#!/usr/bin/env python3
"""
analyze-logs.py

Parses raw TrueCoach JSONL export files to extract training patterns used to derive
CoachBrain's progression rules.

Input format (one JSON object per line):
  {"messages": [
    {"role": "user", "content": "Day: Day 1\nDate: Monday October 14, 2024\n\nCompleted exercise:\nA) Bench Press: 95*12\n95*12\n95*12\n   2 left\n\nPrescribe..."},
    {"role": "assistant", "content": "A) Bench Press: 95*12\n95*12\n105*12\n   2-3 left"}
  ]}

Usage:
  python3 scripts/analyze-logs.py <path-to-jsonl-file>
  python3 scripts/analyze-logs.py data/training_athlete_a.jsonl
"""

import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ParsedSet:
    weight: float
    reps: int
    rir: Optional[int] = None


@dataclass
class ParsedExercise:
    name: str
    sets: list[ParsedSet] = field(default_factory=list)
    is_deload: bool = False


@dataclass
class ParsedSession:
    date: str
    exercises: list[ParsedExercise] = field(default_factory=list)
    is_deload: bool = False


# ── Parsing helpers ────────────────────────────────────────────────────────────

def parse_rir_from_note(note: str) -> Optional[int]:
    """Extract RIR from common inline formats: '2 left', '2-3 left', 'RIR 2'."""
    note = note.lower().strip()
    # "2 left", "2-3 left" → take the lower number
    m = re.search(r'(\d+)(?:-\d+)?\s+left', note)
    if m:
        return int(m.group(1))
    # "rir 2", "rir: 2"
    m = re.search(r'rir[:\s]+(\d+)', note)
    if m:
        return int(m.group(1))
    return None


def parse_set_line(line: str) -> Optional[ParsedSet]:
    """
    Parse a set line like:
      '95*12', '95x12', '95 x 12', '135*5  2 left'
    Returns None if the line doesn't look like a set.
    """
    line = line.strip()
    # Match weight*reps or weightxreps
    m = re.match(r'^(\d+(?:\.\d+)?)\s*[x*]\s*(\d+)(.*)?$', line, re.IGNORECASE)
    if not m:
        return None

    weight = float(m.group(1))
    reps = int(m.group(2))
    rest = m.group(3) or ''
    rir = parse_rir_from_note(rest)

    return ParsedSet(weight=weight, reps=reps, rir=rir)


def parse_exercise_block(block: str) -> Optional[ParsedExercise]:
    """
    Parse a multi-line exercise block like:
      'A) Bench Press: 95*12\n95*12\n95*12\n   2 left'
    """
    lines = [l.strip() for l in block.strip().split('\n') if l.strip()]
    if not lines:
        return None

    # First line typically has label + exercise name
    first = lines[0]
    # Strip leading label like 'A)', 'B1)', etc.
    name_match = re.match(r'^[A-Za-z0-9]+[\)\.]\s*(.*?)(?::\s*(.*))?$', first)
    if name_match:
        exercise_name = name_match.group(1).strip()
        first_set_str = name_match.group(2) or ''
    else:
        exercise_name = first
        first_set_str = ''

    parsed_sets = []

    # Try to parse the first set from the same line as the name
    if first_set_str:
        s = parse_set_line(first_set_str)
        if s:
            parsed_sets.append(s)

    # Parse remaining lines as sets or RIR notes
    for line in lines[1:]:
        s = parse_set_line(line)
        if s:
            parsed_sets.append(s)
        else:
            # Could be a standalone RIR note like "   2 left" — apply to last set
            rir = parse_rir_from_note(line)
            if rir is not None and parsed_sets:
                for ps in parsed_sets:
                    if ps.rir is None:
                        ps.rir = rir

    if not exercise_name:
        return None

    return ParsedExercise(name=exercise_name, sets=parsed_sets)


def parse_session_from_user_message(content: str) -> Optional[ParsedSession]:
    """Extract date and exercises from a TrueCoach user message."""
    # Extract date
    date_match = re.search(r'Date:\s*\w+\s+(\w+\s+\d+,\s+\d{4})', content)
    if not date_match:
        return None

    date_str = date_match.group(1)
    try:
        from datetime import datetime
        date_obj = datetime.strptime(date_str, '%B %d, %Y')
        date_iso = date_obj.strftime('%Y-%m-%d')
    except ValueError:
        date_iso = date_str

    is_deload = bool(re.search(r'deload', content, re.IGNORECASE))

    # Extract the "Completed exercise" section
    exercise_section_match = re.search(
        r'Completed exercise[s]?:(.*?)(?:\n\n\w|\Z)',
        content,
        re.DOTALL | re.IGNORECASE
    )
    if not exercise_section_match:
        return ParsedSession(date=date_iso, exercises=[], is_deload=is_deload)

    exercise_section = exercise_section_match.group(1)

    # Split into per-exercise blocks by label lines like "A)", "B)", "C1)"
    exercise_blocks = re.split(r'\n(?=[A-Za-z]\d*[\)\.]\s+)', exercise_section)

    exercises = []
    for block in exercise_blocks:
        ex = parse_exercise_block(block.strip())
        if ex and ex.sets:
            ex.is_deload = is_deload
            exercises.append(ex)

    return ParsedSession(date=date_iso, exercises=exercises, is_deload=is_deload)


# ── Analysis functions ─────────────────────────────────────────────────────────

def compute_rir_distribution(sessions: list[ParsedSession]) -> dict:
    """Count how often each RIR value appears across all sessions."""
    distribution: dict[int, int] = defaultdict(int)
    total_with_rir = 0

    for sess in sessions:
        for ex in sess.exercises:
            for s in ex.sets:
                if s.rir is not None:
                    distribution[s.rir] += 1
                    total_with_rir += 1

    return dict(sorted(distribution.items())), total_with_rir


def find_deload_sessions(sessions: list[ParsedSession]) -> list[str]:
    """Return dates of sessions flagged as deload."""
    return [s.date for s in sessions if s.is_deload]


def compute_progression_increments(sessions: list[ParsedSession]) -> dict:
    """
    For each exercise, track weight changes session-over-session.
    Returns a dict mapping exercise name → list of (from_weight, to_weight, increment).
    """
    # Group sessions by exercise, then find consecutive weight changes
    exercise_history: dict[str, list[tuple[str, float]]] = defaultdict(list)

    for sess in sorted(sessions, key=lambda s: s.date):
        for ex in sess.exercises:
            if ex.sets:
                max_weight = max(s.weight for s in ex.sets)
                exercise_history[ex.name].append((sess.date, max_weight))

    increments: dict[str, list] = {}
    for name, history in exercise_history.items():
        if len(history) < 2:
            continue
        changes = []
        for i in range(1, len(history)):
            prev_date, prev_w = history[i - 1]
            curr_date, curr_w = history[i]
            diff = curr_w - prev_w
            if diff != 0:
                changes.append({
                    'from_date': prev_date,
                    'to_date': curr_date,
                    'from_weight': prev_w,
                    'to_weight': curr_w,
                    'increment': diff,
                })
        if changes:
            increments[name] = changes

    return increments


def print_summary(sessions: list[ParsedSession], filepath: str) -> None:
    print(f"\n{'='*60}")
    print(f"CoachBrain Log Analysis")
    print(f"File: {filepath}")
    print(f"{'='*60}\n")

    # Basic stats
    deload_dates = find_deload_sessions(sessions)
    non_deload = [s for s in sessions if not s.is_deload]

    print(f"Total sessions parsed:    {len(sessions)}")
    print(f"Non-deload sessions:      {len(non_deload)}")
    print(f"Deload sessions:          {len(deload_dates)}")
    if deload_dates:
        print(f"  Deload dates: {', '.join(deload_dates)}")

    # RIR distribution
    dist, total_with_rir = compute_rir_distribution(sessions)
    total_sets = sum(
        len(ex.sets)
        for s in sessions
        for ex in s.exercises
    )
    print(f"\nTotal sets logged:        {total_sets}")
    print(f"Sets with RIR data:       {total_with_rir} ({total_with_rir/total_sets*100:.1f}%)" if total_sets > 0 else "")

    if dist:
        print("\nRIR Distribution:")
        print(f"  {'RIR':>5} | {'Count':>6} | {'%':>6}")
        print(f"  {'-----':>5}-+-{'------':>6}-+-{'------':>6}")
        for rir_val, count in dist.items():
            pct = count / total_with_rir * 100 if total_with_rir > 0 else 0
            print(f"  {rir_val:>5} | {count:>6} | {pct:>5.1f}%")

        avg_rir = sum(k * v for k, v in dist.items()) / total_with_rir if total_with_rir > 0 else 0
        mode_rir = max(dist.items(), key=lambda x: x[1])[0]
        print(f"\n  Average RIR: {avg_rir:.2f}")
        print(f"  Mode RIR:    {mode_rir}")

    # Progression increments
    increments = compute_progression_increments(sessions)
    if increments:
        print("\nProgression Increments by Exercise:")
        for ex_name, changes in list(increments.items())[:10]:  # show top 10
            positive = [c['increment'] for c in changes if c['increment'] > 0]
            negative = [c['increment'] for c in changes if c['increment'] < 0]
            if positive:
                avg_inc = sum(positive) / len(positive)
                print(f"  {ex_name[:40]:<40} avg +{avg_inc:.1f} lbs ({len(positive)} increases, {len(negative)} resets)")

    print(f"\n{'='*60}\n")


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 analyze-logs.py <path-to-jsonl-file>")
        print("Example: python3 analyze-logs.py data/training_athlete_a.jsonl")
        sys.exit(1)

    filepath = sys.argv[1]
    sessions: list[ParsedSession] = []

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line_number, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError as e:
                    print(f"Warning: Could not parse line {line_number}: {e}", file=sys.stderr)
                    continue

                # Each record is {"messages": [user_msg, assistant_msg]}
                messages = record.get('messages', [])
                user_messages = [m for m in messages if m.get('role') == 'user']

                for msg in user_messages:
                    content = msg.get('content', '')
                    if 'Completed exercise' in content:
                        sess = parse_session_from_user_message(content)
                        if sess:
                            sessions.append(sess)

    except FileNotFoundError:
        print(f"Error: File not found: {filepath}", file=sys.stderr)
        sys.exit(1)

    if not sessions:
        print("No sessions could be parsed from the file.")
        sys.exit(0)

    print_summary(sessions, filepath)


if __name__ == '__main__':
    main()
