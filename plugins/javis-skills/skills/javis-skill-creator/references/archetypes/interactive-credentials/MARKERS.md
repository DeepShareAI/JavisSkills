# interactive-credentials — template markers

The creator fills these `{{…}}` placeholders when scaffolding a skill from this archetype
into `ClawSkills/<slug>/`. After substitution, **no `{{…}}` may remain** (Phase-3 Tier-1
check #2). The entry-script file is named `{{slug_base}}.js` on disk and is renamed to
`<slug>.js` during scaffolding.

| Marker | Meaning | Example |
|---|---|---|
| `{{slug}}` | Skill slug (kebab-case); skill `name`, dir name, entry-script basename. | `luma-event-manager` |
| `{{slug_base}}` | Disk filename stem of the entry script before rename (`scripts/{{slug_base}}.js` → `scripts/<slug>.js`). | `luma-event-manager` |
| `{{title}}` | Human-readable title (H1 / README heading). | `Luma Event Manager` |
| `{{description}}` | One-line skill description (frontmatter + package.json). | `Discover, RSVP, and view Luma events.` |
| `{{provider}}` | Credential provider name passed to `skill_credentials_*({"provider": …})` and used in control tokens `<{{provider}}-connected>` etc. Lowercase. | `luma` |
| `{{PROVIDER_UPPER}}` | `{{provider}}` upper-cased for env-var names the gateway injects (`<PROVIDER>_SESSION`, `<PROVIDER>_USER_ID`, `<PROVIDER>_API_BASE`). | `LUMA` |
| `{{verb}}` | Primary entry-script command / function name (the first provider action). | `search` |
| `{{provider_command_example}}` | One example auth-required command line for docs. | `luma my events` |
| `{{triggers}}` | Comma-separated trigger phrases for the description. | `luma search, luma rsvp` |
| `{{keywords}}` | Comma-separated keyword list (YAML scalar) for frontmatter `keywords:`. | `luma, events, rsvp` |
| `{{keywords_json}}` | Same keywords as a JSON array body for package.json (e.g. `"luma", "events"`). | `"luma", "events", "rsvp"` |
| `{{data_type}}` | (Optional reporting only) `type` for `postSkillData` if the skill also persists rows. | `events` |

## Invariants the creator must preserve

- `scripts/javis-contract.js` is vendored **byte-identical** to the creator's
  `references/javis-contract.js` (Phase-3 Tier-1 check #4). It is NOT a marker file.
- The entry script imports `./javis-contract.js` and builds **no** `Authorization` header,
  raw `fetch` to javis-server, server URL, or cron arg itself — server-boundary calls go
  through the contract module only (checks #5–#7).
- No cron, no per-user state file, no `register.js` in this archetype.
- This archetype MAY emit native cards because output is a live SSE agent turn — the
  opposite of periodic-push.
