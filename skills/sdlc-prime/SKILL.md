---
name: sdlc-prime
description: >-
  Primes a target project's CLAUDE.md with a delimited, idempotent Speculator usage
  section — commands, gate model, comprehension as-built mode, and operational
  cautions — tailored to what the project actually is, so future sessions can use
  Speculator without external docs. Use when the user says "/sdlc prime", "/spec
  prime", "prime this project", "teach this project speculator", or "onboard this
  repo to speculator".
---

# `/sdlc prime` — Teach a Project to Use Speculator

You are priming a project: writing a compact Speculator usage section into its
`CLAUDE.md` so that every future session in that project knows the pipeline exists,
how to drive it, and what to avoid. Prime **teaches**; it never runs gates, never
generates config, and never touches anything in `CLAUDE.md` outside its own fenced
section.

## The marker contract (stable public API)

The primed section is fenced by these two exact lines:

```
<!-- speculator:prime:start -->
<!-- speculator:prime:end -->
```

These strings are a released contract — re-runs find the section only by matching
them verbatim. Never vary their spelling, casing, or spacing.

## Process

### 1. Establish target state

Run from the target project root. Collect, in one pass:

1. **CLAUDE.md state** — one of: absent; present without markers; present with
   exactly one well-formed marker pair (start line before end line); present with
   malformed markers (a start with no end, an end with no start, an end before a
   start, or more than one pair). Record the line numbers of every marker line you
   find.
2. **Config state** — does `.claude/sdlc.local.md` exist? If yes, read its `gates:`
   block and note which opt-in gates (`eval-intent`, `eval-quality`,
   `comprehension`) are enabled, and the `comprehension.mode` if set.
3. **Language detection** — the target counts as as-built-supported when any
   supported language is present: TypeScript (`tsconfig.json` at the root, or
   `.ts`/`.tsx` sources outside `node_modules`), Go (`go.mod` or `.go` sources),
   Java (`pom.xml`/`build.gradle*` or `.java` sources), or Python
   (`pyproject.toml`/`setup.py` or `.py` sources). Use bounded globs (e.g.
   `src/**/*.ts`), falling back to a repo-wide search capped at the first match.
4. **Plugin version** — read `version` from this plugin's own manifest at
   `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Today's date comes from
   `date +%Y-%m-%d`.

### 2. Hard stop on malformed markers

If CLAUDE.md contains markers in any arrangement other than exactly one start line
followed later by exactly one end line: **write nothing**. Report what you found and
where, e.g.:

> CLAUDE.md markers are malformed: found `speculator:prime:start` at line 42 with no
> matching end marker. Repair the fence by hand (or delete both marker lines and the
> content between them), then re-run `/sdlc prime`.

Do not attempt repair heuristics, do not guess where the section "should" be, do not
delete anything. This is the same rule family as never regenerating what you don't
own.

### 3. Offer config scaffolding (delegation, never generation)

If `.claude/sdlc.local.md` is missing, tell the user and offer to scaffold it **by
running the `sdlc-doctor` skill's `--init` flow** (see `skills/sdlc-doctor/SKILL.md`
§ `--init` Flag). Doctor is the single owner of config generation — prime must never
emit config YAML itself, not even "just the defaults". If the user declines, continue
priming and note in the section that config is not yet initialized (`/sdlc doctor
--init` to create it). If config exists, leave it byte-untouched.

### 4. Compose the section

Build the section from the template below. Keep the final section **at or under 60
lines** — it rides in every future session's context, so compactness is a feature
requirement, not a style preference. Substitutions:

- The only substitution tokens are `{VERSION}`, `{DATE}`, `{GATES_LINE}`, and
  `{ASBUILT_BLOCK}`. Any other braced text in the template (e.g. the
  `docs/specs/{feature}/evidence/` path) is literal notation — copy it verbatim.
- `{VERSION}` / `{DATE}` — from step 1.4.
- `{GATES_LINE}` — reflect the project's real config: name which opt-in gates are
  enabled (e.g. "Opt-in gates enabled here: eval-intent, eval-quality, comprehension
  (asbuilt mode)."), or "No opt-in gates enabled yet." when none, or "Config not yet
  initialized — run `/sdlc doctor --init`." when sdlc.local.md is absent. Never
  describe a gate as enabled that the config does not enable.
- `{ASBUILT_BLOCK}` — for targets in a **supported language** (TypeScript, Go,
  Java, Python), the full block from the template (enablement snippet + backfill
  pointer + the two cautions). For targets in **no supported language**, replace
  the entire block with the single line:
  `As-Built comprehension currently supports TypeScript, Go, Java, and Python codebases; for other languages the legacy comprehension gate (mode: legacy) and the judge-only degraded mode remain available.`

Template (between the markers; the markers themselves wrap it):

```markdown
## Speculator (spec pipeline) — primed by /sdlc prime, plugin v{VERSION}, {DATE}

This project uses the Speculator plugin for spec-driven quality gates.
Start any non-trivial feature with a spec — do not code first.

**Commands** (both `/sdlc` and `/spec` prefixes work):
- `/sdlc start` — create a spec in a worktree (runs doctor first)
- `/sdlc score` — Gate 1: blinded spec-quality scoring
- `/sdlc run` — the full pipeline autonomously (trust-laddered)
- `/sdlc gate` — check or run an individual gate
- `/sdlc status` — where every spec stands
- `/sdlc close` — Gate 4, merge/PR delivery, SYSTEM-SPEC compaction
- `/sdlc doctor` — health check; `--init` scaffolds .claude/sdlc.local.md
- `/sdlc prime` — refresh this section after plugin upgrades

**Gate model:** Gate 1 spec quality → Gate 2 code quality (tests) →
opt-ins: 2a eval intent (pre-code), 2b eval quality (post-code),
2c comprehension → Gate 3 code review → Gate 4 evidence package.
Every gate writes YAML evidence under docs/specs/{feature}/evidence/;
judges are blinded (never see thresholds) and the invoker stamps results.
{GATES_LINE}

**As-Built comprehension (Gate 2c, measured mode):** deterministic
code-graph citation checks + a blinded judge. Enable with:

    gates:
      comprehension:
        enabled: true
        mode: asbuilt

For an existing codebase, the backfill workflow bootstraps and audits a
knowledge bundle at docs/asbuilt/ with no spec required — see the plugin's
docs/comprehension-workflow.md and skills/asbuilt-gate/SKILL.md § Backfill
mode. Two cautions: never re-run skeleton.ts on a bundle that already has
enrichment (it destroys audited prose — use extract.ts + refresh.ts to
update), and never trust manifest call edges for "X is consumed by Y"
claims (bare-name false positives — verify by reading the consumer).

Treat any single-run gate score within 6.3–7.7 as borderline: re-run
median-of-3 or get human review before acting on it.
```

(The As-Built paragraph and config snippet are `{ASBUILT_BLOCK}` — swap per step 4.)

### 5. Write

- **No CLAUDE.md** → create it containing only the fenced section, and say so
  explicitly in your report ("created CLAUDE.md — it contained no prior content").
- **CLAUDE.md without markers** → append the fenced section at the end of the file,
  preceded by exactly one blank line. Every byte above it stays untouched.
- **Well-formed markers present** → replace only the lines strictly between the two
  markers with the new section body. The markers and everything outside them stay
  byte-identical.

Never reflow, reformat, re-indent, or "fix" anything outside the fence — including
whitespace. Outside the markers, prime is read-only.

### 6. Report

Summarize: created vs updated, the version/date stamped, supported-language or unsupported tailoring
applied, which gates the section reports as enabled, and whether config scaffolding
was run, offered-and-declined, or unnecessary. Suggest `/sdlc start` as the natural
next step in a freshly-primed project.

## Do NOT

- Generate or modify `.claude/sdlc.local.md` (delegate to doctor `--init`)
- Modify anything in CLAUDE.md outside the marker fence, however small
- Repair malformed markers by guessing
- Describe gates or modes the project's config does not actually enable
- Run any gate, scorer, or backfill from this skill — prime only teaches
- Exceed ~60 lines between the markers
