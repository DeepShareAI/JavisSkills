# JavisSkills

A personal-plugin bundle for the Javis ecosystem.

**Latest release: [v0.7.0](https://github.com/DeepShareAI/JavisSkills/releases/tag/v0.7.0)** — `javis-brainstorming` gains a top-level **intent branch**: a new Q0 (asked first, through the same per-question open→MC→echo gate) splits *writing a piece for an audience* from *clarifying a concept for yourself*. The WRITE branch reproduces the v0.6.0 flow exactly (format question + Q1–Q5 trunk → writing brief); the new CLARIFY branch runs its own C1–C4 concept trunk and emits a **concept-clarification brief** (`…-clarification.md`, local only — it never writes back to the wiki). A new **wiki → resources** source stream reads a Javis wiki page and then its linked sources **one at a time** (per-source summary line, honoring the privacy gate) — primary for CLARIFY, optional research input for WRITE. Both branches gain ported rigor from `superpowers/brainstorming`: a process-flow diagram, an explicit CLI/Desktop/plain-text render matrix, a brief self-review pass before you see the output, and a just-in-time visual companion. Still no drafting — both branches stop at an approved brief. Previously ([v0.4.4](https://github.com/DeepShareAI/JavisSkills/releases/tag/v0.4.4)): `javis-skill-creator` now scaffolds a dedicated user-facing `README.md` for every skill and moves the [HiJavis iPhone app](https://apps.apple.com/us/app/hijavis/id6745134765) install notice there, out of `SKILL.md`. Since openclaw loads `SKILL.md` (not `README.md`) into the agent's runtime context, the notice no longer adds prose to the agent's prompt at run time. The generated README follows a warm, non-technical template (Picture this → What it does → How to use it → What makes it handy → Good to know). Previously ([v0.4.3](https://github.com/DeepShareAI/JavisSkills/releases/tag/v0.4.3)): every scaffolded skill carried a HiJavis-app install notice inside `SKILL.md`. (Adopts 3-segment semver.) Earlier ([v0.4.2.2](https://github.com/DeepShareAI/JavisSkills/releases/tag/v0.4.2.2)): fixed the periodic-push template (correct openclaw cron flags, a runnable `output` contract, and a guarded HTTP source) so generated skills work out of the box. `javis-skill-creator` (renamed from `skill-creator`) enforces HiJavis loop-conformance and runs a Phase 0 feasibility gate: it checks each request against the live architecture (`references/architecture-capabilities.md`) and, when something isn't supported, explains why and offers a degraded build. Works on both Claude Desktop and Claude Code.

## Components

| Component | Type | Purpose |
|---|---|---|
| `javis-filesystem` | Skill | Local filesystem + paper-project operations. Drop-in replacement for the Workspace-MCP stdio server. |
| `javis-brainstorming` | Skill | Intent-aware brainstorming that first branches on whether you're **writing a piece** for an audience or **clarifying a concept** for yourself. The write branch stays format-aware (reports, articles, news pieces, blog posts); the clarify branch runs its own concept trunk and produces a **clarification brief**. Pulls Javis transcripts via the connector, accepts user files, and can read a Javis **wiki page and then its linked resources one at a time** as a source stream. Writes a structured brief (`…-brief.md` or `…-clarification.md`) to `briefs/`. Does not draft prose. |
| `javis-skill-creator` _(v0.4.2)_ | Skill | Scaffolds new HiJavis (openclaw) skills that follow the periodic-push loop (cron → Node script → POST `/api/agent/push` → Socket.IO → iOS). Runs a Phase 0 feasibility gate (warns + suggests workarounds for anything the architecture can't support, then offers a degraded build) before walking through 7 questions and generating a bundle under `${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/`; validates with lint + dry-run. Set `JAVIS_SKILL_BASE_DIR` in your shell rc to point at your personal ClawSkills registry parent (defaults to `$HOME`). |
| `javis-mcp` | Connector | Remote MCP server at `https://mcp.javis.is/mcp`. Voice sessions, transcripts, group transcripts, summaries, full-text search, plus `wiki_*` tools for reading Javis wiki pages and their linked resources. |

## Install

Install in Claude Desktop via **Customize → Plugins → + → Add marketplace** and paste this repo's GitHub `owner/repo` (`DeepShareAI/JavisSkills`) into the URL field. Click Sync, then click the `+` on the **Javis skills** card to install. The plugin's skills are loaded in **Claude Code (Code mode)** sessions, not in regular Chat — use Code mode to invoke them.

After installing the plugin, open **Javis skills → Connectors** in the Plugins panel, click **Install** on the `javis-mcp` card, and complete the Clerk sign-in in the browser. The seven voice tools (`list_sessions_tool`, `get_session_tool`, `get_transcript_tool`, `search_transcripts_tool`, `list_groups_tool`, `get_group_transcript_tool`, `list_summaries_tool`) plus the connector's `wiki_*` tools (`wiki_search_tool`, `wiki_list_index_tool`, `wiki_get_page_tool`, `wiki_ingest_tool`, `wiki_get_log_tool`) become callable after sign-in. See [javis-mcp connector](#javis-mcp-connector) for the full tool inventory.

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

The `javis-mcp` connector ships bundled with this plugin (declared in `.mcp.json`). It points at `https://mcp.javis.is/mcp` and exposes its tools over MCP's streamable-HTTP transport. Seven cover voice sessions and transcripts:

- `list_sessions_tool` — list recent voice sessions
- `get_session_tool` — fetch one session by ID
- `get_transcript_tool` — full transcript for a session
- `search_transcripts_tool` — full-text search across all transcripts
- `list_groups_tool` — list conversation groups
- `get_group_transcript_tool` — combined transcript for a group
- `list_summaries_tool` — AI-generated summaries

The same connector also exposes a family of `wiki_*` tools that back `javis-brainstorming`'s **wiki → linked resources** source stream (reading a Javis wiki page and then its linked sources one at a time):

- `wiki_search_tool` — full-text find a wiki page by topic
- `wiki_list_index_tool` — browse the wiki index (slug, title)
- `wiki_get_page_tool` — read a page (or a wiki-backed linked source) by slug
- `wiki_ingest_tool` — ingest content into the wiki
- `wiki_get_log_tool` — read the wiki change log

Auth is OAuth (Clerk). On first install, Claude Desktop runs the discovery flow against the server's `WWW-Authenticate` challenge — no credentials are shipped with the plugin. If you previously added `https://mcp.javis.is/mcp` as a standalone custom connector, remove that entry to avoid a stale duplicate before installing the plugin.

## Source attribution

`javis-filesystem` is ported from `mcp_server/Workspace-MCP`. That project still works as a standalone stdio MCP server — use whichever delivery model fits your workflow.
