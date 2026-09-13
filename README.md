# JavisSkills

A personal-plugin bundle for the Javis ecosystem. Installs in **Claude Code / Claude Desktop** and in **Codex CLI** from one repo, with a single copy of every skill.

**Latest release: [v0.9.0](https://github.com/DeepShareAI/JavisSkills/releases/tag/v0.9.0)** — **dual-ecosystem distribution.** The plugin body moves out of the repo root into `plugins/javis-skills/`, and the repo now carries a marketplace manifest for each host: `.claude-plugin/marketplace.json` (Claude) and `.agents/plugins/marketplace.json` (Codex), both pointing at that one directory. Codex additionally reads `plugins/javis-skills/.codex-plugin/plugin.json` for its presentation metadata (`interface` block: display name, category, capabilities, default prompts, brand mark). No skill is duplicated — the skill markdown is host-agnostic and the Python/Node helper scripts run under `bash`, which both hosts provide; the bundled `javis-mcp` remote connector uses a `.mcp.json` shape both hosts accept. Skill prose that named Claude where it meant a capability now names the capability, so the same markdown reads correctly under either host. Versions, which had drifted (`0.6.0` in the Claude marketplace manifest against `0.8.0` in the plugin manifest), are unified at **0.9.0** and enforced by `scripts/check-manifests.mjs` on every push and pull request. No skill behavior changes; existing Claude installs re-sync the marketplace and repoint at the new path. Previously ([v0.7.0](https://github.com/DeepShareAI/JavisSkills/releases/tag/v0.7.0)): `javis-brainstorming` gains a top-level **intent branch**: a new Q0 (asked first, through the same per-question open→MC→echo gate) splits *writing a piece for an audience* from *clarifying a concept for yourself*. The WRITE branch reproduces the v0.6.0 flow exactly (format question + Q1–Q5 trunk → writing brief); the new CLARIFY branch runs its own C1–C4 concept trunk and emits a **concept-clarification brief** (`…-clarification.md`, local only — it never writes back to the wiki). A new **wiki → resources** source stream reads a Javis wiki page and then its linked sources **one at a time** (per-source summary line, honoring the privacy gate) — primary for CLARIFY, optional research input for WRITE. Both branches gain ported rigor from `superpowers/brainstorming`: a process-flow diagram, an explicit CLI/Desktop/plain-text render matrix, a brief self-review pass before you see the output, and a just-in-time visual companion. Still no drafting — both branches stop at an approved brief. Previously ([v0.4.4](https://github.com/DeepShareAI/JavisSkills/releases/tag/v0.4.4)): `javis-skill-creator` now scaffolds a dedicated user-facing `README.md` for every skill and moves the [HiJavis iPhone app](https://apps.apple.com/us/app/hijavis/id6745134765) install notice there, out of `SKILL.md`. Since openclaw loads `SKILL.md` (not `README.md`) into the agent's runtime context, the notice no longer adds prose to the agent's prompt at run time. The generated README follows a warm, non-technical template (Picture this → What it does → How to use it → What makes it handy → Good to know). Previously ([v0.4.3](https://github.com/DeepShareAI/JavisSkills/releases/tag/v0.4.3)): every scaffolded skill carried a HiJavis-app install notice inside `SKILL.md`. (Adopts 3-segment semver.) Earlier ([v0.4.2.2](https://github.com/DeepShareAI/JavisSkills/releases/tag/v0.4.2.2)): fixed the periodic-push template (correct openclaw cron flags, a runnable `output` contract, and a guarded HTTP source) so generated skills work out of the box. `javis-skill-creator` (renamed from `skill-creator`) enforces HiJavis loop-conformance and runs a Phase 0 feasibility gate: it checks each request against the live architecture (`references/architecture-capabilities.md`) and, when something isn't supported, explains why and offers a degraded build.

## Components

All three skills live under `plugins/javis-skills/skills/`; the connector is declared in `plugins/javis-skills/.mcp.json`.

| Component | Type | Purpose |
|---|---|---|
| `javis-filesystem` | Skill | Local filesystem + paper-project operations. Drop-in replacement for the Workspace-MCP stdio server. |
| `javis-brainstorming` | Skill | Intent-aware brainstorming that first branches on whether you're **writing a piece** for an audience or **clarifying a concept** for yourself. The write branch stays format-aware (reports, articles, news pieces, blog posts); the clarify branch runs its own concept trunk and produces a **clarification brief**. Pulls Javis transcripts via the connector, accepts user files, and can read a Javis **wiki page and then its linked resources one at a time** as a source stream. Writes a structured brief (`…-brief.md` or `…-clarification.md`) to `briefs/`. Does not draft prose. |
| `javis-skill-creator` _(v0.4.2)_ | Skill | Scaffolds new HiJavis (openclaw) skills that follow the periodic-push loop (cron → Node script → POST `/api/agent/push` → Socket.IO → iOS). Runs a Phase 0 feasibility gate (warns + suggests workarounds for anything the architecture can't support, then offers a degraded build) before walking through 7 questions and generating a bundle under `${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/`; validates with lint + dry-run. Set `JAVIS_SKILL_BASE_DIR` in your shell rc to point at your personal ClawSkills registry parent (defaults to `$HOME`). |
| `javis-mcp` | Connector | Remote MCP server at `https://mcp.javis.is/mcp`. Voice sessions, transcripts, group transcripts, summaries, full-text search, plus `wiki_*` tools for reading Javis wiki pages and their linked resources. |

## Repo layout

```
JavisSkills/
├── .claude-plugin/marketplace.json      Claude marketplace  → ./plugins/javis-skills
├── .agents/plugins/marketplace.json     Codex marketplace   → ./plugins/javis-skills
├── plugins/javis-skills/                the plugin root, shared by both hosts
│   ├── .claude-plugin/plugin.json
│   ├── .codex-plugin/plugin.json
│   ├── .mcp.json                        javis-mcp connector
│   ├── assets/
│   └── skills/{javis-filesystem,javis-brainstorming,javis-skill-creator}/
├── scripts/check-manifests.mjs          manifest cross-check (CI)
├── docs/
└── README.md
```

`docs/`, `README.md`, and the repo tooling stay at the root — they are repo metadata, not plugin payload. The root is not skippable, though: **both marketplace manifests live there**, and Codex resolves `.agents/plugins/marketplace.json` from the repo root before it ever looks inside `plugins/javis-skills/`. A default Codex install therefore fetches the whole repo — see [Codex CLI](#codex-cli).

## Install

Pick your host. Both install from the same GitHub source, `DeepShareAI/JavisSkills`, and both end at the shared connector sign-in below.

### Claude Desktop / Claude Code

**Customize → Plugins → + → Add marketplace**, paste this repo's GitHub `owner/repo` (`DeepShareAI/JavisSkills`) into the URL field. Click Sync, then click the `+` on the **Javis skills** card to install. The plugin's skills are loaded in **Claude Code (Code mode)** sessions, not in regular Chat — use Code mode to invoke them.

Already on an older release? Re-sync the marketplace: v0.9.0 moved the plugin body to `plugins/javis-skills/` and the marketplace manifest repoints at it.

### Codex CLI

**Add plugin marketplace**, then:

| Field | Value |
|---|---|
| Source | `DeepShareAI/JavisSkills` |
| Git ref | `main` |
| Sparse paths | *(leave empty)* |

Or, from a shell:

```bash
codex plugin marketplace add DeepShareAI/JavisSkills --ref main
```

**Leave the sparse path empty.** Codex resolves the marketplace manifest from the repo root of the checkout, and this repo's Codex manifest is `.agents/plugins/marketplace.json` — outside the plugin body. A checkout narrowed to `plugins/javis-skills` has no `.agents/` at all, so the add fails with `marketplace root does not contain a supported manifest`. The full repo is small (skill markdown plus helper scripts), so fetching all of it costs almost nothing.

Install the **Javis Skills** plugin from the card that appears; Codex reads its `interface` metadata from `plugins/javis-skills/.codex-plugin/plugin.json` and loads all three skills from `plugins/javis-skills/skills/`.

If you do want to narrow the checkout anyway, pass **both** paths — the manifest directory *and* the plugin body:

```bash
codex plugin marketplace add DeepShareAI/JavisSkills --ref main \
  --sparse .agents --sparse plugins/javis-skills
```

(Both forms verified against `codex-cli 0.154.0`.)

### Then: sign in to the javis-mcp connector (both hosts)

The connector ships bundled with the plugin and needs OAuth (Clerk) authorization once per host — no credentials are shipped with the plugin, so the host runs the discovery flow against the server's `WWW-Authenticate` challenge.

- **Claude Desktop / Claude Code** — open **Javis skills → Connectors** in the Plugins panel, click **Install** on the `javis-mcp` card, and complete the Clerk sign-in in the browser.
- **Codex** — the marketplace entry declares `authentication: ON_INSTALL`, so the same Clerk sign-in opens in the browser as part of installing the plugin. Complete it there.

The seven voice tools (`list_sessions_tool`, `get_session_tool`, `get_transcript_tool`, `search_transcripts_tool`, `list_groups_tool`, `get_group_transcript_tool`, `list_summaries_tool`) plus the `wiki_*` tools (`wiki_search_tool`, `wiki_list_index_tool`, `wiki_get_page_tool`, `wiki_ingest_tool`, `wiki_get_log_tool`) become callable after sign-in. See [javis-mcp connector](#javis-mcp-connector) for the full tool inventory.

## javis-filesystem prerequisites

Only `read_xlsx.py` needs an external library: `openpyxl`. Python 3.11+ is required for all scripts. Pick one of the install paths:

**Preferred — isolated venv (no system conflicts, works on PEP-668 Pythons):**

```bash
python3 -m venv ~/.javis-filesystem-venv
~/.javis-filesystem-venv/bin/pip install openpyxl
# Invoke read_xlsx via the venv's python. <plugin-root> is the host's installed copy of
# plugins/javis-skills/ — in this repo the script is at
#   plugins/javis-skills/skills/javis-filesystem/scripts/read_xlsx.py
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

The `javis-mcp` connector ships bundled with this plugin (declared in `plugins/javis-skills/.mcp.json`). It points at `https://mcp.javis.is/mcp` and exposes its tools over MCP's streamable-HTTP transport. Seven cover voice sessions and transcripts:

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

Auth is OAuth (Clerk); see [the sign-in step](#then-sign-in-to-the-javis-mcp-connector-both-hosts) above. If you previously added `https://mcp.javis.is/mcp` as a standalone custom connector, remove that entry to avoid a stale duplicate before installing the plugin.

## Source attribution

`javis-filesystem` is ported from `mcp_server/Workspace-MCP`. That project still works as a standalone stdio MCP server — use whichever delivery model fits your workflow.
