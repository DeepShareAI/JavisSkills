# {{title}}

{{description}}

An **interactive-credentials** HiJavis (openclaw) skill: user-triggered, runs inside a
**live SSE agent turn**, authenticates to the **{{provider}}** provider via the platform's
`skill_credentials` service, then calls the {{provider}} API and returns results inline.

## Flow

```
user command
  → skill_credentials_status({"provider": "{{provider}}"})
      → if unauth: skill_credentials_request_external_auth({"provider": "{{provider}}"})
  → scripts/{{slug}}.js reads {{provider}} cookies from env → calls the {{provider}} API
  → results returned INLINE to the live agent turn (markdown and/or native cards)
```

## Output rendering

Because output is a **live agent turn**, this skill MAY emit native iOS cards
(`EventList` / `EventCard` / `ActionButtons` / `SuccessCard`) as well as markdown. This is
the **opposite** of the periodic-push archetype, whose cron/push path is markdown-only.

## Credentials

The {{provider}} cookies are injected into the container environment by javis-server's
gateway manager after the user signs in. `scripts/{{slug}}.js` reads them from `process.env`
(e.g. `{{PROVIDER_UPPER}}_SESSION`, `{{PROVIDER_UPPER}}_USER_ID`). Nothing is hardcoded; the
user is never asked to paste cookies.

## Commands

```
{{slug}} status        # is {{provider}} connected?
{{slug}} configure     # open the in-app {{provider}} sign-in
{{slug}} disconnect    # forget {{provider}} credentials
{{provider_command_example}}
```

## Layout

```
{{slug}}/
├── SKILL.md
├── README.md
├── package.json
└── scripts/
    ├── javis-contract.js   # vendored VERBATIM — auth, postSkillData, postAgentPush,
    │                        #   toNaiveLocal, localAnchor, getRecentTranscripts, buildCronAdd
    └── {{slug}}.js         # entry script: reads {{provider}} creds, calls the {{provider}} API
```

There is **no cron, no per-user state file, and no `register.js`** in this archetype.

## Local dry-run

`scripts/javis-contract.js` reads `process.env.JAVIS_SERVER_URL` (default
`http://javis-server:8000`), so the creator's mock server can repoint it for an offline
dry-run of any optional `postSkillData` / `postAgentPush` calls.

## Publish

```bash
clawhub publish
```

## License

MIT
