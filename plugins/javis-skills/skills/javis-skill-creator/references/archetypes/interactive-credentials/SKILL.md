---
name: {{slug}}
description: {{description}} Authenticates via the platform's skill_credentials service (in-chat WebView, or email + OTP fallback) for the "{{provider}}" provider, then calls the {{provider}} API with the user's stored cookies and returns results to the live chat turn. Triggers: {{triggers}}.
keywords: {{keywords}}
metadata:
  openclaw:
    runtime:
      node: ">=18"
---

# {{title}}

{{description}}

This is an **interactive-credentials** skill. It runs inside a **live SSE agent turn**:
the user issues a command, the skill checks/obtains "{{provider}}" credentials, calls the
third-party API, and returns the result **inline to the current chat turn**.

> ## Output rendering — this archetype MAY emit native cards
> Because every run of this skill returns to a **live SSE agent turn** (not a cron/push
> delivery), it MAY emit the native iOS cards — `EventList`, `EventCard`, `ActionButtons`,
> `SuccessCard` — in addition to plain markdown. This is the **opposite** of the
> periodic-push archetype, whose cron/push path is **markdown-only** (native cards never
> render there). Use cards when they improve the live result (e.g. an `EventList` of
> {{provider}} results, an `ActionButtons` row to confirm an action, a `SuccessCard` on
> completion). Plain markdown is always also valid.

## Authentication model (auth-first flow)

All `{{provider}}` data access goes through the platform's `skill_credentials` service. The
credential cookies are injected into this container's **environment** by javis-server's
gateway manager after the user signs in; the entry script reads them from `process.env`.
The skill code never asks the user to paste cookies and never hardcodes a token.

The flow for any auth-required command:

```
user command
  → skill_credentials_status({"provider": "{{provider}}"})
      → if configured:   proceed to call the {{provider}} API
      → if NOT configured: skill_credentials_request_external_auth({"provider": "{{provider}}"})
                           (opens the in-app WebView; wait for the user's next turn)
  → entry script reads {{provider}} cookies from env → calls the 3rd-party API
  → return results INLINE to this live agent turn (markdown and/or native cards)
```

### Step 1 — Check current state

**REQUIRED ACTION:** Call `skill_credentials_status({"provider": "{{provider}}"})`.
- If the result is `{configured: true, ...}` → proceed to call the {{provider}} API (Step 3).
- For any other result (`configured: false`, missing, null, or an error envelope) → go to Step 2.

Do not skip this check — Step 3 depends on knowing the current state, and calling the
provider API without credentials will fail with an auth error.

### Step 2 — Open the in-app sign-in

**REQUIRED ACTION:** Call `skill_credentials_request_external_auth({"provider": "{{provider}}"})`.
You MUST call this tool **before** replying any text. The tool returns immediately and the iOS
app intercepts the result to open a WebView modal for the {{provider}} sign-in page.

**After the tool call succeeds**, reply with a short bubble like `Opening {{provider}} sign-in…`
and **stop the turn**. Do NOT call any further tools in this turn — wait for the user's next
message, which will be one of the control tokens below.

> ⚠️ The reply text by itself does NOT open the modal — only the **tool result** does. If you
> reply without calling the tool, the user sees your message but the WebView never opens and
> the flow stalls.

The user's next turn will be one of three platform control tokens. Treat them strictly as
enum signals; **never echo them back to the user**:

- `<{{provider}}-connected>` → cookies were uploaded. Call `skill_credentials_status` to
  confirm, then **resume the original request** (Step 3) if one was pending, else reply
  `✅ {{provider}} connected. What would you like to do?`.
- `<{{provider}}-cancelled>` → user closed the modal. Reply
  `OK, {{provider}} not connected. Let me know if you want to try again.` Do NOT call any tool.
- `<{{provider}}-save-failed>` → cookies captured but failed to persist. Reply
  `Hit a snag saving — please tap retry on the toast.` Do NOT call any tool.

#### Fallback for non-iOS clients (email + OTP)

If `skill_credentials_request_external_auth` returns `{ok: false, error: "provider_unsupported"}`
OR no `<{{provider}}-connected>` / `<{{provider}}-cancelled>` token arrives within ~120s:

1. Ask the user for their {{provider}} email.
2. Call `skill_credentials_request_otp({"provider": "{{provider}}", "email": "<email>"})`.
3. Wait for the 6-digit code in the user's reply.
4. Call `skill_credentials_verify_otp({"provider": "{{provider}}", "email": "<email>", "code": "<code>"})`.
5. On success: `✅ {{provider}} connected.` On `invalid_code`: ask them to retry. On
   `rate_limited`: wait the suggested seconds before retrying.

### Step 3 — Call the {{provider}} API and return results

Once credentials are confirmed, run the entry script:

```bash
node scripts/{{slug}}.js <command> [args...]
```

The entry script (`scripts/{{slug}}.js`) reads the `{{provider}}` cookies from `process.env`
and calls the third-party API. It prints a JSON result envelope on stdout. Surface that result
to the user **in this same live turn** — as markdown, or as native cards when they fit.

If the entry script reports `status: "auth"` (401/403), the stored cookies are stale: tell the
user to reconnect (`{{slug}}` configure) and do **not** retry the API call in the same turn.

## Commands

- `{{slug}} status` → `skill_credentials_status({"provider": "{{provider}}"})` and report.
- `{{slug}} configure` / `{{slug}} connect` → run the Configure flow (Step 2).
- `{{slug}} disconnect` → `skill_credentials_clear({"provider": "{{provider}}"})`, then reply
  `✅ {{provider}} disconnected.`
- `{{provider_command_example}}` → an auth-required action; auto-configure first if needed,
  then run `scripts/{{slug}}.js` and return results inline.

## Server-side reporting (optional)

This archetype returns results to the live turn and does **not** require any server write. If a
particular action should ALSO persist structured rows or push a separate digest, the entry
script may call the vendored contract module (`scripts/javis-contract.js`):

- `postSkillData({ skill, type, items })` — to upsert structured rows the iOS app renders.
  Every `start_at` / `end_at` MUST be **naive-local wall-clock** (`YYYY-MM-DDTHH:MM:SS`, no
  `Z`/offset); the module's `toNaiveLocal(iso, tz)` produces it and `postSkillData` enforces it.
- `postAgentPush({ skill, content })` — to push a separate **markdown** message.

There is **no cron, no per-user state file, and no `register.js`** in this archetype by default.

## Contract module

`scripts/javis-contract.js` is the canonical openclaw → javis-server → iOS contract spine,
vendored **verbatim** (byte-identical to the creator's `references/javis-contract.js`). The
entry script never builds auth headers, formats timestamps, constructs server URLs, or
assembles cron args itself — it only calls into that module.
