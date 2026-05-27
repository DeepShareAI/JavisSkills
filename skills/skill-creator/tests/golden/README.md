# skill-creator golden tests

Regression fixtures for the `skill-creator` skill. Each fixture pins:
- `answers.json` — the 7 answers the user provides
- `prompt.txt` — the literal prompt fed to `claude -p` (non-interactive invocation)
- `expected-bundle/` — the exact files Claude should write under `./generated-skills/<slug>/`

## Run a single fixture

```bash
cd skills/skill-creator/tests/golden
./run-golden.sh sample-daily
```

## Run all fixtures

```bash
for f in skills/skill-creator/tests/golden/*/; do
  ./skills/skill-creator/tests/golden/run-golden.sh "$(basename "$f")"
done
```

Exit code 0 = pass, non-zero = fail (diff is printed).

## Adding a fixture

1. Create `<name>/answers.json` (object with keys: slug, description, trigger_words, cron_schedule, cron_tz, data_sources, channels, needs_state).
2. Create `<name>/prompt.txt` (e.g., `Use the skill-creator skill with these pre-recorded answers: <paste JSON>. After writing the files, run only validation Check 1 (frontmatter) and Check 1b (no leaked {{...}}). Skip Checks 2 and 3 in the golden run.`).
3. Run `claude -p` by hand once, inspect the output, copy it into `<name>/expected-bundle/`.
4. Run `./run-golden.sh <name>` — should pass on the second invocation.
5. Commit.

## Why this matters

The skill is a markdown prompt; unit tests don't apply. Golden tests catch regressions when templates or the SKILL.md procedural prompt change.
