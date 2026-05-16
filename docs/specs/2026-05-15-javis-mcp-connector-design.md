# javis-mcp connector — design

**Date:** 2026-05-15
**Status:** Approved (pending implementation)
**Scope:** Bundle the remote `javis-mcp` MCP server into the `javis-skills` plugin so it appears under the plugin's **Connectors** tab in Claude Desktop, matching the UX used by other personal plugins (Engineering, Scientific writer).

## Goal

Today, users who want both `javis-filesystem` and `javis-mcp` have to install the plugin **and** separately add `https://mcp.javis.is/mcp` as a custom connector. Folding the connector into the plugin manifest makes the install a single click in Claude Desktop and surfaces the connector under **Javis skills → Connectors**.

The plugin already carries one skill (`javis-filesystem`). After this change it carries one skill plus one connector. No skill changes.

## Out of scope

- Bundling additional third-party connectors (Gmail, Slack, Notion, etc.). Considered and dropped — single-connector scope keeps the plugin focused.
- Any change to the `javis-mcp` server itself (auth, tools, transport). The server already returns `401 + WWW-Authenticate` on unauthenticated `POST /mcp`, which is what triggers Claude Desktop's OAuth discovery.
- Renaming the skill namespace or the `javis-filesystem` skill.

## Architecture

```
JavisSkills/                          # plugin root
├── .claude-plugin/
│   ├── plugin.json                   # version 0.1.2 → 0.2.0, description widened
│   └── marketplace.json              # matching version bump
├── .mcp.json                         # NEW — declares the javis-mcp HTTP server
├── README.md                         # edited — javis-mcp connector section
└── skills/
    └── javis-filesystem/             # unchanged
```

Claude Code auto-discovers `.mcp.json` at the plugin root (per the [Plugins reference](https://code.claude.com/docs/en/plugins-reference)). On install, the plugin's MCP servers register with Claude Desktop and render under the plugin's **Connectors** tab; each connector gets its own Install button that runs the OAuth flow on click.

## `.mcp.json`

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

- **Key** — `javis-mcp`. This is the display label in the Connectors UI **and** the prefix on tool names (`mcp__javis-mcp__list_sessions_tool`, etc.).
- **`type`** — `"http"`. The MCP spec calls this transport `streamable-http`; the `.mcp.json` schema accepts `"http"` as the canonical alias. Matches what `server.py` mounts via `mcp.http_app(transport="streamable-http")`.
- **`url`** — production endpoint. No env-var override; bundling a configurable URL would mean shipping `${JAVIS_MCP_URL:-…}` and asking every user to set a variable they don't need.
- **No `headers`, no `env`, no secrets.** Auth runs entirely through the server-driven Clerk OAuth flow — the plugin doesn't carry credentials.

## Install flow (end-user)

1. User installs the `javis-skills` plugin from the marketplace.
2. Claude Desktop registers the plugin's MCP servers; `javis-mcp` appears under **Javis skills → Connectors** with an **Install** button.
3. User clicks **Install** on the `javis-mcp` row.
4. Claude Desktop sends an unauthenticated `POST /mcp`. The server's `_BearerOrChallenge` middleware (`javis-server/javis_mcp/server.py:166-184`) responds `401 Unauthorized` with `WWW-Authenticate: Bearer resource_metadata="<issuer>/.well-known/oauth-protected-resource"`.
5. Claude Desktop fetches the protected-resource metadata, runs the Clerk OAuth dance (authorize → callback → token), and stores the access token.
6. The seven voice tools become callable: `list_sessions_tool`, `get_session_tool`, `get_transcript_tool`, `search_transcripts_tool`, `list_groups_tool`, `get_group_transcript_tool`, `list_summaries_tool`.

Steps 4–6 are unchanged from today's standalone-connector flow. The only thing this design adds is the discovery surface — users find and install the connector from inside the plugin instead of typing the URL into "Add custom connector".

## `plugin.json` and `marketplace.json` updates

Both files get a version bump `0.1.2 → 0.2.0` (minor: new surface, not breaking) and a widened description:

```json
{
  "name": "javis-skills",
  "version": "0.2.0",
  "description": "Javis personal-plugin skills: local filesystem operations plus the javis-mcp remote connector (voice sessions, transcripts, summaries).",
  "author": { "name": "Samuel Wei", "email": "samuel@deepshare.ai" }
}
```

`marketplace.json` carries the same `version` and `description` in its `plugins[0]` entry.

## README updates

Three surgical edits to `README.md`:

1. **Rename the table heading** from "Skills included" to "Components" and add a `javis-mcp` row:

   ```
   | Component | Type | Purpose |
   |---|---|---|
   | javis-filesystem | Skill | Local filesystem + paper-project operations. Drop-in replacement for the Workspace-MCP stdio server. |
   | javis-mcp | Connector | Remote MCP server at https://mcp.javis.is/mcp. Voice sessions, transcripts, group transcripts, summaries, full-text search. |
   ```

2. **Replace the "Coexistence with javis_mcp" section** with a new "javis-mcp connector" section that says: tagline, the seven tools, and the install flow (install plugin → open Connectors tab → click Install → complete Clerk sign-in).

3. **Update the "Install" section** to note that the plugin now bundles the connector — users no longer need to add `https://mcp.javis.is/mcp` separately. The original sentence "install the `javis_mcp` remote connector separately" is removed.

Nothing else in the README changes. The `javis-filesystem prerequisites`, `Working root`, and `Source attribution` sections are kept verbatim.

## Verification

Three checks before declaring the change shipped:

1. **Local load** — `claude --plugin-dir /Users/samuelwei/GoogleDrive/LLM/JavisSkills` and confirm `/help` lists the namespace plus the seven `mcp__javis-mcp__*` tools registered (they'll fail to call without OAuth, which is expected pre-install).
2. **OAuth challenge sanity** — `curl -i -X POST https://mcp.javis.is/mcp` returns `401` with `WWW-Authenticate: Bearer resource_metadata="https://mcp.javis.is/.well-known/oauth-protected-resource"`. Confirms the server's discovery hook is live.
3. **End-to-end UX** — install the plugin in Claude Desktop from the marketplace, open **Javis skills → Connectors**, click Install on `javis-mcp`, complete Clerk sign-in, then call `list_sessions_tool` from a chat and confirm a response.

Steps 1 and 2 are cheap pre-flight; step 3 is the only one that proves the screenshot's UX.

## Risks and mitigations

- **Duplicate registration.** If a user already added `https://mcp.javis.is/mcp` as a standalone custom connector and then installs the plugin, Claude Code's scope hierarchy deduplicates plugin-provided servers by endpoint URL (per the MCP doc's "Scope hierarchy and precedence"). The standalone entry wins, the plugin's entry is skipped, no double-prompt. No action needed beyond a README note suggesting users remove the standalone entry to avoid a stale local-scope copy.
- **Marketplace caching.** Claude Desktop caches marketplace JSON; users may need to click **Sync** on the marketplace card after the version bump for the new `mcpServers` to appear. Noted in the README.
- **OAuth flow regression.** Out of scope for this change — the server-side flow is unchanged. If it breaks, that's a `javis-server` issue, not a plugin issue.

## Decisions log

| # | Decision | Why |
|---|---|---|
| 1 | One connector, not a curated set | Keep the plugin focused on the Javis surface. Third-party connectors can be added later. |
| 2 | Endpoint pinned to `https://mcp.javis.is/mcp`, no env override | No real use case for per-user override; adds friction. |
| 3 | `.mcp.json` at plugin root, not inline in `plugin.json` | Matches the convention used by the rest of the plugin (skills in their own directory, not inline). One responsibility per file. |
| 4 | Display label = JSON key `javis-mcp` | Claude Desktop has no `displayName` field; the key is the label. Tool prefix `mcp__javis-mcp__*` reads sensibly. |
| 5 | Skip bundling Slack/Gmail/Calendar/Notion | User decision after considering the curated-set option. |
| 6 | Version 0.2.0 (minor bump) | New surface, no breaking change. Existing `javis-filesystem` users are unaffected. |
