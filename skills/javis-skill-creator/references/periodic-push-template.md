# Periodic-Push Skill Template

This document defines the literal text of every file generated for a periodic-push skill. Substitution markers use `{{snake_case}}`; conditional blocks use `{{#if FLAG}}...{{/if}}`.

## Substitution markers

| Marker | Source | Example |
|---|---|---|
| `{{slug}}` | Q1 | `daily-news-digest` |
| `{{slug_base}}` | derived from slug | `daily-news-digest` (used for `scripts/<slug_base>.js`) |
| `{{TitleCaseSlug}}` | derived | `Daily News Digest` |
| `{{description}}` | Q2 | one-line ≤200 chars |
| `{{tagline_from_description}}` | first sentence of Q2 | — |
| `{{trigger_words_csv}}` | Q3 | `每日新闻, daily news, news digest` |
| `{{trigger_words_bullets}}` | Q3 reformatted | `- "每日新闻"\n- "daily news"\n- "news digest"` |
| `{{trigger_words_json_array}}` | Q3 reformatted | `"每日新闻", "daily news", "news digest"` (JSON-array contents, including the surrounding quotes per item; the surrounding `[ ]` are already in the package.json template) |
| `{{cron_crontab}}` | Q4 translated | `0 8 * * *` |
| `{{cron_tz}}` | follow-up to Q4 | `Asia/Shanghai` |
| `{{example_trigger_phrase}}` | Q4 + Q6 example | `每天8点推送新闻到telegram` |
| `{{channels_csv}}` | Q6 | `telegram, discord, slack, feishu` |
| `{{channels_pipe}}` | Q6 for shell help | `telegram|discord|slack|feishu` |
| `{{step_1_from_data_sources}}` | Q5 | text — see "Data-source step map" below |
| `{{step_2_from_data_sources}}` | Q5 | text |
| `{{step_1_code_block}}` | Q5 | code — see map |
| `{{step_2_code_block}}` | Q5 | code |

## Conditional block flags

| Flag | True when |
|---|---|
| `has_cron` | Q4 is non-blank |
| `needs_register` | Q7 = yes |
| `needs_data` | Q7 = yes OR Q5 includes `pure-local-state` OR `has_cron` is true (push-toggle.js requires data.js) |
| `has_external_http` | Q5 includes `external-http` |
| `pure_node_builtins` | `has_external_http` is false |
| `has_multi_data_source` | Q5 selects 2+ data sources |

## Data-source step map (Q5 → step text + code)

When Q5 includes multiple sources, prepend each block to the workflow in this order: `transcripts` → `external-http` → `pure-local-state` → `user-typed-text`. Use up to 2 steps in the SKILL.md workflow; the remaining sources go into a "Notes" bullet.

Every code block reads its raw input and then pushes a string onto the shared `parts`
array that `main()` declares (see the entry-script template). `main()` joins `parts`
into the `output` that gets pushed to iOS — so a generated script always produces
`output` and never throws `ReferenceError`. Replace the `// TODO: format` lines with
real extraction/formatting for the skill.

### `transcripts`
- step text: `Fetch recent transcripts via the LLM's javis_mcp tools (get_transcript_tool / search_transcripts_tool) and pass the relevant text to this script on stdin.`
- code block:
  ```js
  let transcriptText = '';
  for await (const chunk of process.stdin) transcriptText += chunk;
  // TODO: format `transcriptText` into the content you want pushed.
  parts.push(transcriptText.trim());
  ```

### `external-http`
- step text: `Fetch from the configured HTTP endpoint (set HTTP_SOURCE_URL env var when registering the cron).`
- code block:
  ```js
  const sourceUrl = process.env.HTTP_SOURCE_URL;
  if (!sourceUrl) {
    throw new Error('HTTP_SOURCE_URL env var is not set — configure it when registering the cron job.');
  }
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${sourceUrl}`);
  const data = await res.json();
  // TODO: extract the fields you need from `data` and format them.
  parts.push(JSON.stringify(data, null, 2));
  ```

### `pure-local-state`
- step text: `Read the user's state from data/users/<userId>.json.`
- code block:
  ```js
  const userState = fs.existsSync(safeUserPath(userId))
    ? readJson(safeUserPath(userId))
    : {};
  // TODO: format `userState` into the content you want pushed.
  parts.push(JSON.stringify(userState, null, 2));
  ```

### `user-typed-text`
- step text: `Process the user-typed text passed in argv after <userId>.`
- code block:
  ```js
  const text = process.argv.slice(3).join(' ');
  // TODO: process `text` into the content you want pushed.
  parts.push(text);
  ```

---

## Generated file: `SKILL.md`

```markdown
---
name: {{slug}}
description: {{description}}
keywords: {{trigger_words_csv}}, {{slug}}
metadata:
  openclaw:
    runtime:
      node: ">=18"
---

# {{TitleCaseSlug}}

> {{tagline_from_description}}

> ⚠️ **Requires the HiJavis iPhone app.** This skill runs inside HiJavis.
> Install it first: https://apps.apple.com/us/app/hijavis/id6745134765
> (Informational only — does not affect how the skill runs.)

## When to use

{{trigger_words_bullets}}

## Core commands

```bash
{{#if needs_register}}
# Register (first use)
node scripts/register.js <userId> <name>
{{/if}}

# Run today's flow (also what the cron triggers)
node scripts/{{slug_base}}.js <userId>

{{#if has_cron}}
# Push management
node scripts/push-toggle.js on <userId> [--time HH:MM] [--channel {{channels_pipe}}]
node scripts/push-toggle.js off <userId>
node scripts/push-toggle.js status <userId>
{{/if}}
```

## Workflow

1. {{step_1_from_data_sources}}
{{#if has_multi_data_source}}
2. {{step_2_from_data_sources}}
3. Format output and POST to `http://javis-server:8000/api/agent/push` with `{"skill": "{{slug}}", "content": "<formatted>"}` using `OPENCLAW_GATEWAY_TOKEN` for auth.
{{/if}}
{{#if !has_multi_data_source}}
2. Format output and POST to `http://javis-server:8000/api/agent/push` with `{"skill": "{{slug}}", "content": "<formatted>"}` using `OPENCLAW_GATEWAY_TOKEN` for auth.
{{/if}}

{{#if has_cron}}
## Push setup (cron registration)

When user requests scheduled push:

### Step 1: Save preferences
```bash
node scripts/push-toggle.js on <userId> --time <HH:MM> --channel <channel>
```

### Step 2: Create cron job via openclaw CLI
```bash
openclaw cron add \
  --name "{{slug}}-<userId>" \
  --cron "{{cron_crontab}}" \
  --tz "{{cron_tz}}" \
  --channel <channel> \
  --to "<channel-target-id>" \
  --session isolated \
  --message "Run /{{slug}}: execute node scripts/{{slug_base}}.js <userId>, format output nicely. Then POST to http://javis-server:8000/api/agent/push with JSON body {\"skill\": \"{{slug}}\", \"content\": \"<formatted output>\"} using the gateway bearer token for auth."
```

### Step 3: Confirm to user
Push is set up; results land in iOS agent chat under /{{slug}}.

Supported channels: {{channels_csv}}
{{/if}}

## Notes

- ⚠️ Requires the HiJavis iPhone app — install first: https://apps.apple.com/us/app/hijavis/id6745134765
{{#if needs_data}}
- Data stored in `data/users/<userId>.json`{{#if has_external_http}}; external HTTP source configured separately{{/if}}.
{{/if}}
- {{#if pure_node_builtins}}Built-in Node modules only — no npm install needed.{{else}}Run `npm install` before first run.{{/if}}
{{#if needs_data}}
- User IDs only allow letters, digits, `-`, `_` (path-traversal guard in data.js).
{{/if}}
```

## Generated file: `package.json`

```json
{
  "name": "{{slug}}",
  "version": "0.1.0",
  "description": "{{description}}",
  "keywords": [{{trigger_words_json_array}}],
  "license": "MIT",
  "scripts": {
    {{#if needs_register}}"register": "node scripts/register.js",{{/if}}
    "run": "node scripts/{{slug_base}}.js"{{#if has_cron}},
    "push-on": "node scripts/push-toggle.js on",
    "push-off": "node scripts/push-toggle.js off",
    "push-status": "node scripts/push-toggle.js status"{{/if}}
  }{{#if has_external_http}},
  "engines": { "node": ">=18" }{{/if}}
}
```

Note: no `dependencies` block — Node 18+ provides `fetch`, `fs`, `path`, etc. natively. If a future template needs an npm dep, add `dependencies` here and remove the `# Built-in Node modules only` line from SKILL.md notes.

## Generated file: `scripts/{{slug_base}}.js`

```js
#!/usr/bin/env node
/**
 * {{slug}} — generated by JavisSkills/javis-skill-creator
 * Triggered by openclaw cron OR by the LLM on user-typed commands.
 *
 * Usage:
 *   node {{slug_base}}.js <userId>
 *   node {{slug_base}}.js --help
 */
'use strict';

{{#if needs_data}}const fs = require('fs');
const path = require('path');
const { sanitizeId, safeUserPath, readJson, writeJson } = require('./data');{{/if}}

if (process.argv.includes('--help')) {
  console.log('Usage: node {{slug_base}}.js <userId>');
  process.exit(0);
}

const userId = {{#if needs_data}}sanitizeId(process.argv[2]){{else}}process.argv[2] || 'default'{{/if}};

async function main() {
  const parts = [];
  {{step_1_code_block}}
  {{#if has_multi_data_source}}{{step_2_code_block}}{{/if}}

  // `parts` is filled by the data-source block(s) above. Replace the TODO lines
  // there (and this join, if needed) with the real formatting for your push.
  const output = parts.filter(Boolean).join('\n\n') || '(no content)';
  console.log(output);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
```

## Generated file: `scripts/push-toggle.js` (only when has_cron)

```js
#!/usr/bin/env node
/**
 * {{slug}} — cron push toggle
 * Generated by JavisSkills/javis-skill-creator. Boilerplate; do not edit unless you understand
 * how openclaw cron jobs are listed/removed.
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { sanitizeId, safeUserPath, readJson, writeJson } = require('./data');

const SLUG = '{{slug}}';
const cmd = process.argv[2];
const userId = sanitizeId(process.argv[3]);
const args = process.argv.slice(4);

function getFlag(name, defaultVal) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : defaultVal;
}

const prefsPath = safeUserPath(userId).replace(/\.json$/, '.prefs.json');

function loadPrefs() {
  return fs.existsSync(prefsPath) ? readJson(prefsPath) : {};
}
function savePrefs(p) {
  writeJson(prefsPath, p);
}

const cronName = `${SLUG}-${userId}`;

if (cmd === 'on') {
  const time = getFlag('time', '08:00');
  const channel = getFlag('channel', 'iOS');
  const prefs = { time, channel, enabledAt: new Date().toISOString() };
  savePrefs(prefs);
  console.log(`✅ ${SLUG} push enabled: ${time} via ${channel}`);
  console.log(`Cron name to register: ${cronName}`);
  console.log(`Run: openclaw cron add --name "${cronName}" --cron "<MM HH * * *>" --tz "<tz>" --channel ${channel} --to "<channel-target-id>" --session isolated --message "..."`);
} else if (cmd === 'off') {
  if (fs.existsSync(prefsPath)) fs.unlinkSync(prefsPath);
  try { execSync(`openclaw cron remove --name "${cronName}"`); } catch (_) {}
  console.log(`✅ ${SLUG} push disabled`);
} else if (cmd === 'status') {
  const prefs = loadPrefs();
  if (Object.keys(prefs).length === 0) {
    console.log(`❌ ${SLUG} push not enabled for ${userId}`);
  } else {
    console.log(`✅ ${SLUG} push: ${prefs.time} via ${prefs.channel} (since ${prefs.enabledAt})`);
  }
} else {
  console.error(`Usage: node push-toggle.js [on|off|status] <userId> [--time HH:MM] [--channel {{channels_pipe}}]`);
  process.exit(1);
}
```

## Generated file: `scripts/register.js` (only when needs_register)

```js
#!/usr/bin/env node
/**
 * {{slug}} — register a new user profile
 * Generated by JavisSkills/javis-skill-creator.
 */
'use strict';

const fs = require('fs');
const { sanitizeId, safeUserPath, writeJson } = require('./data');

if (process.argv.includes('--help')) {
  console.log('Usage: node register.js <userId> <name>');
  process.exit(0);
}

const userId = sanitizeId(process.argv[2]);
const name = process.argv[3] || '';

const profile = {
  userId,
  name,
  createdAt: new Date().toISOString(),
};

writeJson(safeUserPath(userId), profile);
console.log(`✅ Registered ${userId} (${name})`);
```

## Generated file: `scripts/data.js` (only when needs_data)

```js
#!/usr/bin/env node
/**
 * {{slug}} — shared data helpers
 * Generated by JavisSkills/javis-skill-creator. Boilerplate; path safety lives here.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const USERS_DIR = path.join(__dirname, '../data/users');

function sanitizeId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    console.error('❌ Invalid userId: letters/digits/-/_ only, length 1-128');
    process.exit(1);
  }
  return value;
}

function safeUserPath(userId) {
  const resolved = path.resolve(USERS_DIR, `${userId}.json`);
  if (!resolved.startsWith(path.resolve(USERS_DIR) + path.sep)) {
    console.error('❌ Illegal path');
    process.exit(1);
  }
  return resolved;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = { sanitizeId, safeUserPath, readJson, writeJson };
```
