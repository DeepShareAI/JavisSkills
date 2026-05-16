# Format Guides

Per-format Step A prompts, MC option flavors, branch question, outline shape, and source priorities.

Load only the section matching the user's Q0 (format) answer. The trunk questions (Q1–Q5) live in `SKILL.md`; this file specifies:

1. The **branch question** to ask immediately after Q0's Step D (before Q1).
2. **Format-specific framings** for the trunk-question MC options.
3. The **outline shape** for Phase 6.
4. **Sources that matter most** for the format.

All questions follow the SKILL.md A → B → C → D loop. Never skip Step C. Never combine questions.

---

## Report

Used for: internal/external reports, analyses, decision memos, post-mortems.

### Branch question (after Q0, before Q1)

**Step A:** "What decision does this report inform — go/no-go, budget, hire, strategy shift, retrospective, or something else?"

**MC construction (Step C):** classification. Build 3 options that interpret the user's Step B answer as one of:
- Decision report (a specific call needs to be made)
- Status / monitoring report (no decision; situational awareness)
- Retrospective / post-mortem (learning from past event)
- + "Other (describe)"

Record as `decision_purpose`.

### Trunk-question framings for reports

**Q1 — Audience.** Step A is the same as SKILL.md. MC option flavors for a report typically include:
- Internal executives / leadership (decision-makers)
- Peer team / cross-functional partners (operational readers)
- External stakeholders (board, investors, client)
- + Other

Adapt the labels to whatever the user's Step B answer suggests.

**Q4 — Tone.** Reports skew formal. MC flavors:
- Neutral / analytical (let the data speak)
- Directive / recommendation-led (lead with the call)
- Cautious / hedged (uncertainty is the story)
- + Other

### Outline shape

| # | Section | Purpose |
|---|---|---|
| 1 | Executive summary | The whole report in 5–10 lines, including the recommendation |
| 2 | Context / background | What situation prompted this report; prior state |
| 3 | Findings | What the data / interviews / observations show — neutrally |
| 4 | Analysis | What the findings mean, with reasoning shown |
| 5 | Recommendations | Specific actions tied to findings |
| 6 | Appendix | Supporting data, methodology, raw transcripts |

### Sources matter most
- Numeric data (metrics, KPIs, financials)
- Stakeholder transcripts / interviews
- Prior reports in the same series (for consistency)
- Documents, decisions, or policies being analyzed

---

## Article (long-form / blog)

Used for: long-form essays, opinion pieces, magazine-style features, in-depth blog posts.

### Branch question (after Q0, before Q1)

**Step A:** "What's the hook — the opening scene, question, or claim that earns the reader's next 30 seconds?"

**MC construction (Step C):** prose. Build 3 sharper rephrasings of the user's Step B answer (one-sentence hook options), plus "Other (describe)". Examples of hook flavors:
- Scene-driven (open in a moment, then zoom out)
- Question-driven (a contrarian or pointed question)
- Claim-driven (a bold one-line thesis the rest defends)
- + Other

Record as `hook`.

### Trunk-question framings for articles

**Q1 — Audience.** MC flavors lean toward reader-relationship rather than role:
- Same-field insiders (you can assume vocabulary)
- Adjacent professionals (define jargon)
- General curious readers (define everything)
- + Other

**Q4 — Tone.** Articles tolerate range. MC flavors:
- Reflective / first-person essayist
- Reported / journalistic
- Polemical / argumentative
- + Other

### Outline shape

| # | Section | Purpose |
|---|---|---|
| 1 | Hook | A scene, anecdote, or pointed claim that earns 30 more seconds |
| 2 | Thesis | The argument, stated plainly |
| 3 | Evidence arc (3–5 beats) | Each beat advances the case: example, data, story, expert voice |
| 4 | Counterpoint | The strongest version of the opposing view, taken seriously |
| 5 | Resolution | How you reconcile the counterpoint without dismissing it |
| 6 | Call to reflect / act | What changes for the reader after reading this |

### Sources matter most
- Personal anecdotes and observations
- On-record quotes from interviewees
- Research papers, books, and cited claims
- Statistics that ground specific beats

---

## News

Used for: news pieces, breaking-news reports, dispatches, time-sensitive announcements.

### Branch question (after Q0, before Q1)

**Step A:** "What is the lede — the single most important fact that goes in the first sentence?"

**MC construction (Step C):** prose. Build 3 crisper rephrasings of the user's Step B lede candidate. Flavor by news-lede archetype:
- "What happened" lede (event-first)
- "Why it matters" lede (impact-first)
- "Who's affected" lede (people-first)
- + Other

Record as `lede`.

### Trunk-question framings for news

**Q1 — Audience.** MC flavors:
- General readers of the publication (no specialist context)
- Industry / beat readers (assume prior context)
- Affected community (insiders to the event)
- + Other

**Q4 — Tone.** News is mostly neutral; MC flavors:
- Straight news (neutral, factual)
- Explanatory (extra "why this matters" connective tissue)
- Investigative (named accountability)
- + Other

### Outline shape

| # | Section | Purpose |
|---|---|---|
| 1 | Lede | The most important sentence; the news in one line |
| 2 | Nut graf | Why this matters, who it affects, what's at stake |
| 3 | Background | Brief context — how we got here |
| 4 | Key facts | Dates, numbers, named parties, on-record statements |
| 5 | Reactions / quotes | What affected parties, experts, opponents say |
| 6 | What's next | Pending decisions, expected next events, deadlines |

### Sources matter most
- Primary sources (official documents, press releases, named witnesses)
- Dated events with verifiable timestamps
- On-record quotes (named source preferred over anonymous)
- Opposing views (essential for credibility)

---

## Blog (informal / opinion / journal)

Used for: short blog posts, personal takes, dev journals, opinion shots, tutorials.

### Branch question (after Q0, before Q1)

**Step A:** "Is this a take, a tutorial, or a journal entry — and what sparked it?"

**MC construction (Step C):** classification. Build 3 options interpreting the user's Step B answer:
- Take (an opinion or argument)
- Tutorial (a how-to, with steps)
- Journal (what I did and what I learned)
- + Other

Record as `blog_subtype`.

### Trunk-question framings for blog

**Q1 — Audience.** MC flavors:
- Peers (same field, casual register)
- Newcomers (assume nothing)
- Subscribers / regular readers (callbacks to prior posts allowed)
- + Other

**Q4 — Tone.** Blogs are usually conversational; MC flavors:
- Conversational / direct
- Wry / self-deprecating
- Earnest / sincere
- + Other

### Outline shape

| # | Section | Purpose |
|---|---|---|
| 1 | Hook | One sentence or short scene — the spark |
| 2 | One idea | State it plainly |
| 3 | Why it matters | Why the reader should care, in one beat |
| 4 | One example | A single concrete example, story, or code block — not three |
| 5 | Close | The takeaway in one line; optionally a question or a small ask |

### Sources matter most
- Personal stories from the user's own week / project
- One anchoring example (concrete is better than abstract)
- Optional outbound links for context (do not list-link-dump)

---

## Other

User's Q0 answer didn't match the four formats above (essay collection, newsletter, video script, talk outline, internal memo, social thread, etc.).

### Branch question (after Q0, before Q1)

**Step A:** "Describe the format in your own words — who reads it, where it lives, roughly how long."

**MC construction (Step C):** Build 3 options proposing the closest match among report / article / news / blog as the starting template, each with a one-line description of why it fits. Plus "Other — none of these, treat it as a custom format".

Record the picked match as `closest_format` and use that section's branch + framings for the rest of the flow.

If "Other — custom" is picked, fall back to asking the user for the structural beats they want and use those as the outline shape. The trunk Q1–Q5 still apply; the brief structure in SKILL.md is unchanged.
