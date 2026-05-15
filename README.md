# JavisSkills

A personal-plugin bundle for the Javis ecosystem.

## Skills included

| Skill | Purpose |
|---|---|
| `javis-filesystem` | Local filesystem + paper-project operations. Drop-in replacement for the Workspace-MCP stdio server. |
| `content-brainstorming` *(planned)* | Structured brainstorming for reports, articles, news pieces, blog posts. Design only — not yet shipped. |

## Install

Install in Claude Desktop via **Customize → Plugins → + → Add marketplace** and paste this repo's GitHub `owner/repo` (`DeepShareAI/JavisSkills`) into the URL field. Click Sync, then click the `+` on the **Javis skills** card to install. The plugin's skills are loaded in **Claude Code (Code mode)** sessions, not in regular Chat — use Code mode to invoke them.

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

## Coexistence with javis_mcp

`javis-filesystem` is the **filesystem** half of a paired setup. For transcripts, sessions, groups, and summaries, install the **`javis_mcp`** remote connector separately (URL: `https://mcp.javis.is/mcp`). The two surfaces don't overlap.

## Source attribution

`javis-filesystem` is ported from `mcp_server/Workspace-MCP`. That project still works as a standalone stdio MCP server — use whichever delivery model fits your workflow.
