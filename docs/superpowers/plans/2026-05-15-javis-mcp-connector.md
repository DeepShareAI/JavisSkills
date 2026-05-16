# javis-mcp connector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle the remote `javis-mcp` MCP server into the `javis-skills` plugin so it appears under **Javis skills → Connectors** in Claude Desktop, removing the separate-install step for users.

**Architecture:** Config-only change to the plugin repo. Add a `.mcp.json` at the plugin root declaring the `javis-mcp` HTTP server pointing at `https://mcp.javis.is/mcp`. Bump the plugin and marketplace versions (`0.1.2 → 0.2.0`) and rewrite the relevant README sections. No skill code changes. No `javis-server` changes — the OAuth + 401-challenge flow is already live.

**Tech Stack:** Claude Code plugin manifest (`plugin.json`), marketplace JSON (`marketplace.json`), plugin `.mcp.json` (MCP HTTP transport), Markdown for docs.

**Spec reference:** [`docs/specs/2026-05-15-javis-mcp-connector-design.md`](../../specs/2026-05-15-javis-mcp-connector-design.md)

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `.mcp.json` | Create | Declare the `javis-mcp` HTTP server entry. |
| `.claude-plugin/plugin.json` | Modify | Version `0.2.0`, widened description. |
| `.claude-plugin/marketplace.json` | Modify | Same version + description in `plugins[0]`. |
| `README.md` | Modify | Rename table heading, add connector row, replace "Coexistence" section, add connector line to Install section. |

No new directories. No deletions. `skills/javis-filesystem/` is untouched.

---

## Task 1: Create `.mcp.json` at plugin root

**Files:**
- Create: `/Users/samuelwei/GoogleDrive/LLM/JavisSkills/.mcp.json`

- [ ] **Step 1: Write the file**

Use the Write tool to create `/Users/samuelwei/GoogleDrive/LLM/JavisSkills/.mcp.json` with exactly this content:

```json
{
  "mcpServers": {
    "javis-mcp": {
      "type": "http",
      "url": "https://mcp.javis.is/mcp"
    }
  }
}
```

- [ ] **Step 2: Verify JSON validity**

Run from the plugin root:
```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills && python3 -m json.tool .mcp.json
```

Expected: the file's contents are echoed back (pretty-printed). Non-zero exit code or "Expecting value" output means the JSON is malformed — fix before continuing.

- [ ] **Step 3: Verify the entry shape**

Run from the plugin root:
```bash
python3 -c 'import json; d=json.load(open(".mcp.json")); s=d["mcpServers"]["javis-mcp"]; assert s["type"]=="http", s; assert s["url"]=="https://mcp.javis.is/mcp", s; print("ok")'
```

Expected output: `ok` (and exit code 0). Any `AssertionError` or `KeyError` means the file shape is wrong — fix before continuing.

- [ ] **Step 4: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add .mcp.json
git commit -m "feat: bundle javis-mcp remote connector via .mcp.json

Declares the javis-mcp HTTP server at https://mcp.javis.is/mcp so it
surfaces under Javis skills → Connectors in Claude Desktop. Auth runs
through the existing server-side Clerk OAuth flow — no secrets shipped
with the plugin."
```

---

## Task 2: Bump version and widen description in `plugin.json` and `marketplace.json`

Both files carry the same version + description and ship in one commit because they're conceptually a single change.

**Files:**
- Modify: `/Users/samuelwei/GoogleDrive/LLM/JavisSkills/.claude-plugin/plugin.json`
- Modify: `/Users/samuelwei/GoogleDrive/LLM/JavisSkills/.claude-plugin/marketplace.json`

- [ ] **Step 1: Edit `plugin.json`**

Use the Edit tool. Replace:
```
  "version": "0.1.2",
  "description": "Javis personal-plugin skills: local filesystem operations (more skills coming)",
```
with:
```
  "version": "0.2.0",
  "description": "Javis personal-plugin skills: local filesystem operations plus the javis-mcp remote connector (voice sessions, transcripts, summaries).",
```

After the edit, the file should read in full:
```json
{
  "name": "javis-skills",
  "version": "0.2.0",
  "description": "Javis personal-plugin skills: local filesystem operations plus the javis-mcp remote connector (voice sessions, transcripts, summaries).",
  "author": {
    "name": "Samuel Wei",
    "email": "samuel@deepshare.ai"
  }
}
```

- [ ] **Step 2: Edit `marketplace.json`**

Use the Edit tool. Replace:
```
      "name": "javis-skills",
      "description": "Javis personal-plugin skills: local filesystem operations (more skills coming)",
      "version": "0.1.2",
```
with:
```
      "name": "javis-skills",
      "description": "Javis personal-plugin skills: local filesystem operations plus the javis-mcp remote connector (voice sessions, transcripts, summaries).",
      "version": "0.2.0",
```

After the edit, the file should read in full:
```json
{
  "name": "javis-skills",
  "owner": {
    "name": "Samuel Wei",
    "email": "samuel@deepshare.ai"
  },
  "plugins": [
    {
      "name": "javis-skills",
      "description": "Javis personal-plugin skills: local filesystem operations plus the javis-mcp remote connector (voice sessions, transcripts, summaries).",
      "version": "0.2.0",
      "source": "./",
      "author": {
        "name": "Samuel Wei",
        "email": "samuel@deepshare.ai"
      }
    }
  ]
}
```

- [ ] **Step 3: Verify both files are valid JSON and versions match**

Run from the plugin root:
```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
python3 -c 'import json; p=json.load(open(".claude-plugin/plugin.json")); m=json.load(open(".claude-plugin/marketplace.json")); assert p["version"]=="0.2.0", p["version"]; assert m["plugins"][0]["version"]=="0.2.0", m["plugins"][0]["version"]; assert p["description"]==m["plugins"][0]["description"], (p["description"], m["plugins"][0]["description"]); print("ok")'
```

Expected output: `ok`. Any assertion failure means the two files drifted — fix before continuing.

- [ ] **Step 4: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "chore: bump version to 0.2.0 for bundled javis-mcp connector

Minor bump — new surface (connector), no breaking change. Existing
javis-filesystem users are unaffected."
```

---

## Task 3: Update `README.md`

Three surgical edits, one commit. Reader of the README must understand: (a) the connector exists and what it offers, (b) how to install it after installing the plugin, and (c) what the seven tools are.

**Files:**
- Modify: `/Users/samuelwei/GoogleDrive/LLM/JavisSkills/README.md`

- [ ] **Step 1: Rename the "Skills included" table to "Components" and add the `javis-mcp` row**

Use the Edit tool. Replace this block (lines 5–10):
```
## Skills included

| Skill | Purpose |
|---|---|
| `javis-filesystem` | Local filesystem + paper-project operations. Drop-in replacement for the Workspace-MCP stdio server. |
| `content-brainstorming` *(planned)* | Structured brainstorming for reports, articles, news pieces, blog posts. Design only — not yet shipped. |
```

with:
```
## Components

| Component | Type | Purpose |
|---|---|---|
| `javis-filesystem` | Skill | Local filesystem + paper-project operations. Drop-in replacement for the Workspace-MCP stdio server. |
| `javis-mcp` | Connector | Remote MCP server at `https://mcp.javis.is/mcp`. Voice sessions, transcripts, group transcripts, summaries, full-text search. |
| `content-brainstorming` *(planned)* | Skill | Structured brainstorming for reports, articles, news pieces, blog posts. Design only — not yet shipped. |
```

- [ ] **Step 2: Add the connector line to the "Install" section**

Use the Edit tool. Replace:
```
## Install

Install in Claude Desktop via **Customize → Plugins → + → Add marketplace** and paste this repo's GitHub `owner/repo` (`DeepShareAI/JavisSkills`) into the URL field. Click Sync, then click the `+` on the **Javis skills** card to install. The plugin's skills are loaded in **Claude Code (Code mode)** sessions, not in regular Chat — use Code mode to invoke them.
```

with:
```
## Install

Install in Claude Desktop via **Customize → Plugins → + → Add marketplace** and paste this repo's GitHub `owner/repo` (`DeepShareAI/JavisSkills`) into the URL field. Click Sync, then click the `+` on the **Javis skills** card to install. The plugin's skills are loaded in **Claude Code (Code mode)** sessions, not in regular Chat — use Code mode to invoke them.

After installing the plugin, open **Javis skills → Connectors** in the Plugins panel, click **Install** on the `javis-mcp` card, and complete the Clerk sign-in in the browser. The seven voice tools (`list_sessions_tool`, `get_session_tool`, `get_transcript_tool`, `search_transcripts_tool`, `list_groups_tool`, `get_group_transcript_tool`, `list_summaries_tool`) become callable after sign-in.
```

- [ ] **Step 3: Replace the "Coexistence with javis_mcp" section**

Use the Edit tool. Replace:
```
## Coexistence with javis_mcp

`javis-filesystem` is the **filesystem** half of a paired setup. For transcripts, sessions, groups, and summaries, install the **`javis_mcp`** remote connector separately (URL: `https://mcp.javis.is/mcp`). The two surfaces don't overlap.
```

with:
```
## javis-mcp connector

The `javis-mcp` connector ships bundled with this plugin (declared in `.mcp.json`). It points at `https://mcp.javis.is/mcp` and exposes seven tools over MCP's streamable-HTTP transport:

- `list_sessions_tool` — list recent voice sessions
- `get_session_tool` — fetch one session by ID
- `get_transcript_tool` — full transcript for a session
- `search_transcripts_tool` — full-text search across all transcripts
- `list_groups_tool` — list conversation groups
- `get_group_transcript_tool` — combined transcript for a group
- `list_summaries_tool` — AI-generated summaries

Auth is OAuth (Clerk). On first install, Claude Desktop runs the discovery flow against the server's `WWW-Authenticate` challenge — no credentials are shipped with the plugin. If you previously added `https://mcp.javis.is/mcp` as a standalone custom connector, remove that entry to avoid a stale duplicate before installing the plugin.
```

- [ ] **Step 4: Verify the README still renders sensibly**

Run from the plugin root:
```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills && grep -c "^## " README.md
```

Expected output: `6` (six `##` headings — Components, Install, javis-filesystem prerequisites, Working root, javis-mcp connector, Source attribution). If the count differs, a section was accidentally removed or duplicated — re-check the edits.

Also verify the table row count:
```bash
grep -c "^| " README.md
```

Expected output: `4` (one header row + three component rows).

- [ ] **Step 5: Commit**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git add README.md
git commit -m "docs: surface javis-mcp connector in README

Renames Skills→Components table, adds the connector row + install
instructions, and replaces the standalone-install note with a section
describing the bundled connector's seven tools and OAuth flow."
```

---

## Task 4: Verify the plugin loads locally and the OAuth challenge is live

Two cheap pre-flight checks before the manual Claude Desktop install. No commits — these are verification, not changes.

- [ ] **Step 1: OAuth challenge sanity**

Run:
```bash
curl -sS -i -X POST https://mcp.javis.is/mcp 2>&1 | head -20
```

Expected: the first line shows `HTTP/2 401` (or `HTTP/1.1 401 Unauthorized`) and one of the response headers reads:

```
www-authenticate: Bearer resource_metadata="https://mcp.javis.is/.well-known/oauth-protected-resource"
```

That `WWW-Authenticate` header is the discovery hook Claude Desktop uses. If you see `HTTP/2 200`, `405`, or `404`, the server's challenge middleware is broken — stop and investigate `javis-server/javis_mcp/server.py:166-184` before continuing. If the header is missing from a `401` response, same thing.

- [ ] **Step 2: Local plugin load — verify the tool namespace registers**

Run:
```bash
claude --plugin-dir /Users/samuelwei/GoogleDrive/LLM/JavisSkills -p "/help" 2>&1 | grep -E "javis-mcp|javis-filesystem|mcp__javis"
```

Expected: at least one line mentioning `javis-mcp` or `mcp__javis-mcp__*` tool entries, plus the `javis-filesystem` skill namespace. If neither shows up, the plugin failed to load — check `.mcp.json` is valid JSON and that the plugin manifest didn't regress in Task 2.

Note: the seven tools will register but be un-callable from this `-p` invocation because OAuth hasn't been completed. That's expected. Tool registration alone is what we're verifying here.

---

## Task 5: End-to-end UX in Claude Desktop (manual)

The only check that proves the screenshot's UX. Not scriptable.

- [ ] **Step 1: Push the version bump to the remote**

```bash
cd /Users/samuelwei/GoogleDrive/LLM/JavisSkills
git push origin main
```

- [ ] **Step 2: Install or sync the plugin in Claude Desktop**

If the marketplace is already added: open Claude Desktop → **Customize → Plugins**, click **Sync** on the `javis-skills` marketplace card, then re-install the plugin so the new `0.2.0` version with `.mcp.json` is picked up.

If the marketplace isn't added yet: **Customize → Plugins → + → Add marketplace**, paste `DeepShareAI/JavisSkills`, click **Sync**, then click the `+` on the **Javis skills** card.

- [ ] **Step 3: Verify the connector appears under Javis skills → Connectors**

In the Plugins panel, click on **Javis skills**, then the **Connectors** sub-row. Expected: one connector card labeled `javis-mcp` with an **Install** button. Layout should match the screenshot reference in the spec (single card, Install button on the right).

- [ ] **Step 4: Click Install and complete the Clerk sign-in**

Click **Install** on the `javis-mcp` card. A browser window opens to the Clerk authorize URL. Sign in with a Javis account. The window closes and the connector card flips to an "installed" state.

- [ ] **Step 5: Call a tool from a regular chat**

Start a new chat in Claude Desktop. Ask:
> "List my five most recent voice sessions."

Expected: Claude calls `mcp__javis-mcp__list_sessions_tool` with `limit=5` and returns a list of sessions. If the call errors with "missing bearer" or 401, the OAuth token didn't save — re-install the connector. If the call errors with "rate_limited", that's the server's token bucket, not a plugin issue.

- [ ] **Step 6: Mark the change shipped**

If Steps 3–5 all passed, the bundled connector works end-to-end. No further commit needed — Task 5 produces no file changes.

---

## Self-review (already run against the spec)

- **Spec coverage:** Architecture (`.mcp.json` at plugin root), the JSON entry, `plugin.json` + `marketplace.json` bumps, three README edits, all three verification checks — each maps to a task.
- **Placeholder scan:** none — every step shows the actual content.
- **Type consistency:** the seven tool names (`list_sessions_tool`, `get_session_tool`, `get_transcript_tool`, `search_transcripts_tool`, `list_groups_tool`, `get_group_transcript_tool`, `list_summaries_tool`) are used identically in Task 3 Step 2, Task 3 Step 3, and Task 5 Step 5.
- **Risks from spec covered:** duplicate-registration warning is in Task 3 Step 3's README copy ("If you previously added… remove that entry…"). Marketplace caching is addressed in Task 5 Step 2 ("click Sync… then re-install").
