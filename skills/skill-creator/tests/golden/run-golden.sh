#!/usr/bin/env bash
# Golden-fixture harness for skill-creator.
# Usage: ./run-golden.sh <fixture-name>
# Reads <fixture>/prompt.txt, runs `claude -p` non-interactively, diffs
# output bundle against <fixture>/expected-bundle/.

set -euo pipefail

FIXTURE="${1:?usage: run-golden.sh <fixture-name>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
FIXDIR="$HERE/$FIXTURE"

[[ -d "$FIXDIR" ]] || { echo "fixture not found: $FIXDIR" >&2; exit 2; }
[[ -f "$FIXDIR/prompt.txt" ]] || { echo "missing $FIXDIR/prompt.txt" >&2; exit 2; }
[[ -d "$FIXDIR/expected-bundle" ]] || { echo "missing $FIXDIR/expected-bundle/" >&2; exit 2; }

# Read the expected slug from answers.json (jq optional; awk fallback)
if command -v jq >/dev/null; then
  SLUG="$(jq -r '.slug' "$FIXDIR/answers.json")"
else
  SLUG="$(awk -F'"' '/"slug"/{print $4; exit}' "$FIXDIR/answers.json")"
fi
[[ -n "$SLUG" ]] || { echo "could not read slug from answers.json" >&2; exit 2; }

# Run inside a clean temp dir so generated-skills/ doesn't pollute the repo
WORK="$(mktemp -d -t skill-creator-golden-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

echo "→ Running claude -p against fixture '$FIXTURE' (work dir: $WORK)"
claude -p "$(cat "$FIXDIR/prompt.txt")" >/tmp/claude-output-$$.log 2>&1 || {
  echo "❌ claude -p exited non-zero. Last 30 lines:" >&2
  tail -30 /tmp/claude-output-$$.log >&2
  exit 1
}

OUT="$WORK/generated-skills/$SLUG"
[[ -d "$OUT" ]] || {
  echo "❌ expected generated-skills/$SLUG not found in $WORK" >&2
  echo "claude output tail:" >&2
  tail -30 /tmp/claude-output-$$.log >&2
  exit 1
}

echo "→ Diffing $OUT against $FIXDIR/expected-bundle/"
if diff -r --brief "$FIXDIR/expected-bundle" "$OUT"; then
  echo "✅ Golden test '$FIXTURE' PASSED"
  exit 0
else
  echo "❌ Golden test '$FIXTURE' FAILED — bundles differ"
  echo "  Re-run with: diff -r '$FIXDIR/expected-bundle' '$OUT'"
  exit 1
fi
