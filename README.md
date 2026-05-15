# JavisSkills

A personal-plugin bundle for the Javis ecosystem.

## Skills included

| Skill | Purpose |
|---|---|
| `javis-filesystem` | Local filesystem + paper-project operations. Drop-in replacement for the Workspace-MCP stdio server. |
| `content-brainstorming` *(planned)* | Structured brainstorming for reports, articles, news pieces, blog posts. Design only — not yet shipped. |

## Install

Install as a personal plugin. The plugin manifest at `.claude-plugin/plugin.json` declares both skills.

## javis-filesystem prerequisites

The helper scripts need Python 3.11+ and two libraries:

```bash
pip3 install --user openpyxl PyYAML
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
