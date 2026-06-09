# periodic-push archetype

Literal template text for every file the creator generates for a **periodic-push** skill
(cron fires → `getRecentTranscripts` → agent extracts → `postSkillData({status:'pending'})` →
`postAgentPush(markdown)`). Generalizes `calendar-extractor`.

- [`periodic-push-template.md`](./periodic-push-template.md) — the marker/conditional table plus
  the literal body of each generated file: `SKILL.md`, `scripts/<slug_base>.js`, `scripts/data.js`,
  `scripts/push-toggle.js`, `scripts/register.js`, `package.json`, `README.md`.
- `scripts/javis-contract.js` is **not** templated here — the creator copies
  `../../javis-contract.js` **verbatim (byte-identical)** into the generated skill's `scripts/`.

## The 6 gaps this archetype closes (vs. the old `references/periodic-push-template.md`)

1. **Invalid `--schedule` cron flag.** Cron argv is built only by `buildCronAdd` (from the vendored
   contract), which uses `--cron`/`--every`/`--at` and throws on `--schedule`/`--command`.
   `push-toggle.js on` prints the line from `buildCronAdd`, never hand-assembled flags.
2. **`data.js` missing zero-config user.** `data.js` now includes `resolveUserId()` and
   `DEFAULT_USER_ID = 'self'`; every script takes `[userId]` as optional.
3. **`push-toggle.js` prefs missing `tz`.** Prefs are now `{ time, channel, tz, enabledAt }`,
   matching the gold `self.prefs.json`.
4. **Non-atomic writes.** `writeJson` writes to a `.tmp` sibling then `fs.renameSync` over the
   target — no half-written state files on a mid-write kill.
5. **No markdown-only-push warning.** `SKILL.md` has an explicit "markdown-only push (no native
   cards)" section; the entry script's `formatDigest` produces markdown only.
6. **No canonical skill_data schema / tz helpers.** The entry script writes structured rows via
   `postSkillData` (status `pending`, `dedup_key`, `payload`, naive-local `start_at`/`end_at`) and
   formats timestamps via `toNaiveLocal`; `postSkillData` runs `assertNaiveLocal` before sending.

## Hard rules for the generated entry script

- Imports `./javis-contract.js` and `./data`. Builds output **only** through contract calls.
- Never constructs an `Authorization` header, a `http(s)://…` server URL, or cron args itself.
- Vendors `javis-contract.js` byte-identical into `scripts/` (Phase-3 drift check enforces this).
