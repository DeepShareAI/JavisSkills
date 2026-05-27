# JavisSkills

A personal-plugin bundle for the Javis ecosystem.

## Components

| Component | Type | Purpose |
|---|---|---|
| `javis-filesystem` | Skill | Local filesystem + paper-project operations. Drop-in replacement for the Workspace-MCP stdio server. |
| `content-brainstorming` | Skill | Format-aware brainstorming for reports, articles, news pieces, and blog posts. Pulls Javis transcripts via the connector + accepts user files, then writes a structured brief to `briefs/`. Does not draft prose. |
| `skill-creator` | Skill | Scaffolds new HiJavis (openclaw) skills that follow the periodic-push loop (cron → Node script → POST `/api/agent/push` → Socket.IO → iOS). Walks through 7 questions, generates a bundle under `./generated-skills/<slug>/`, validates with lint + dry-run. |
| `javis-mcp` | Connector | Remote MCP server at `https://mcp.javis.is/mcp`. Voice sessions, transcripts, group transcripts, summaries, full-text search. |

## Install

Install in Claude Desktop via **Customize → Plugins → + → Add marketplace** and paste this repo's GitHub `owner/repo` (`DeepShareAI/JavisSkills`) into the URL field. Click Sync, then click the `+` on the **Javis skills** card to install. The plugin's skills are loaded in **Claude Code (Code mode)** sessions, not in regular Chat — use Code mode to invoke them.

After installing the plugin, open **Javis skills → Connectors** in the Plugins panel, click **Install** on the `javis-mcp` card, and complete the Clerk sign-in in the browser. The seven voice tools (`list_sessions_tool`, `get_session_tool`, `get_transcript_tool`, `search_transcripts_tool`, `list_groups_tool`, `get_group_transcript_tool`, `list_summaries_tool`) become callable after sign-in.

## javis-filesystem prerequisites

Only `read_xlsx.py` needs an external library: `openpyxl`. Python 3.11+ is required for all scripts. Pick one of the install paths:

**Preferred — isolated venv (no system conflicts, works on PEP-668 Pythons):**

```bash
python3 -m venv ~/.javis-filesystem-venv
~/.javis-filesystem-venv/bin/pip install openpyxl
# Invoke read_xlsx via the venv's python:
~/.javis-filesystem-venv/bin/python3 <plugin-root>/skills/javis-filesystem/scripts/read_xlsx.py ...
```

**Or — user-site install (simpler):**

```bash
pip3 install --user openpyxl
# If your Python is PEP-668 managed (newer Homebrew, Debian/Ubuntu system Python)
# you'll see "error: externally-managed-environment". In that case:
pip3 install --user --break-system-packages openpyxl
```

To render papers, install `pandoc` separately. If pandoc is missing, `render_pandoc.py` emits `{"skipped": true, "reason": "pandoc not on PATH"}` and exits 0 — it does not fail loudly.

## Working root

`javis-filesystem` operates on a single working directory at a time:
- Set `JAVIS_FS_ROOT=/absolute/path` to pin it.
- Otherwise it uses the current working directory.

Path traversal outside the root is rejected.

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

## Source attribution

`javis-filesystem` is ported from `mcp_server/Workspace-MCP`. That project still works as a standalone stdio MCP server — use whichever delivery model fits your workflow.
