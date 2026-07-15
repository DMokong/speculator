## implementer — round 1

### What I changed

- **Created `asbuilt/tests/helpers/dense-fixture.ts`** — the generator
  (`makeDenseSandbox(): string`). Follows plan.md Task T02 Step 2's reference
  implementation verbatim: a `SHAPE` table (`cmd/cli` 54 sources + 42 tests,
  `internal/model` 6, `internal/util` 4, `internal/cli` 4, plus a root
  `main.go`), a `concept()` builder emitting OKF frontmatter matching
  `parseVizFrontmatter`'s field expectations (type/title/description/
  resource/tags/enrichment/from/explains/stale), and a `write()` helper that
  fans out concept files + `.graph-manifest.json` symbols/edges. No
  `Math.random`, no `Date`/clock reads anywhere in the file — every byte is a
  pure function of the fixed `SHAPE` table and loop indexes.
- **Did not need to create `asbuilt/tests/dense-fixture.test.ts`** — it
  already existed on disk (untracked) when I started this round, evidently
  produced by an earlier test-author pass over this same task stream. I read
  it, confirmed it matches the brief's done-check (111 concepts; 54 in
  `cmd/cli` + 42 in the pre-T04 global `tests` bucket, with a `// flips to 96
  ... once SPEC-004 T04 lands` comment; determinism via a same-sandbox
  byte-identical rebuild AND an independent-sandbox content-equality check;
  generator cleanup), and left it untouched — my generator was written to
  satisfy its existing assertions rather than the other way around. No
  assertion in it turned out to be miscalculated against the reference
  implementation (see concept-count math below), so I did not need to invoke
  the brief's "adjusting only if... assertions reveal a miscalculation"
  clause.

### Concept-count math (111 decomposition)

| Group | Sources | Tests | Concepts |
|---|---|---|---|
| `cmd/cli` | 54 | 42 | 96 |
| `internal/model` | 6 | 0 | 6 |
| `internal/util` | 4 | 0 | 4 |
| `internal/cli` | 4 | 0 | 4 |
| root `main.go` | 1 | 0 | 1 |
| **Total** | | | **111** |

Grouping under today's (pre-T04) `viz.ts`: test concepts are classified into
the single global `"tests"` bucket by frontmatter (`isTestConcept`), never by
path — so the 42 `cmd/cli/*_test.go` concepts land in group `"tests"`, and
the 54 `cmd/cli/*.go` sources land in group `"cmd/cli"` (via `groupOf`,
2-segment prefix). `main.go` (single path segment) groups to `"src"` under
`groupOf`'s `parts.length > 2` rule. `internal/model` / `internal/util` /
`internal/cli` each group to themselves (2-segment prefix, no tests).

### Enrichment stride outcome

The `i` index in the reference implementation resets per directory and per
source/test sub-loop (not a single running counter across all 111
concepts) — confirmed by reading `dense-fixture.test.ts`'s own comment on
this exact point, and it matches Step 2 of the plan verbatim. Per-loop
`i % 3 === 0` counts:

- `cmd/cli` sources (i=0..53, 54 items): 18 audited (0,3,...,51)
- `cmd/cli` tests (i=0..41, 42 items): 14 audited (0,3,...,39)
- `internal/model` sources (i=0..5, 6 items): 2 audited (0,3)
- `internal/util` sources (i=0..3, 4 items): 2 audited (0,3)
- `internal/cli` sources (i=0..3, 4 items): 2 audited (0,3)
- `main.go` (i=0, 1 item): 1 audited (0)

**Total audited: 18+14+2+2+2+1 = 39 of 111**, matching
`result.audited === 39` / `data.meta.audited === 39` asserted in the test
file and confirmed green by the test run below.

### Verification command tails

**`bun test asbuilt/tests/dense-fixture.test.ts`:**

```
bun test v1.3.14 (0d9b296a)

 10 pass
 0 fail
 27 expect() calls
Ran 10 tests across 1 file. [124.00ms]
```

**`cd asbuilt && bunx tsc --noEmit && cd ..`:**

```
(no output — exit code 0, clean typecheck)
```

**Commit:**

```
$ git add asbuilt/tests/ && git commit -m "test(asbuilt): dense flat-package fixture, field-shape 111 concepts (SPEC-004 T02)"
[main d13077a] test(asbuilt): dense flat-package fixture, field-shape 111 concepts (SPEC-004 T02)
 2 files changed, 235 insertions(+)
 create mode 100644 asbuilt/tests/dense-fixture.test.ts
 create mode 100644 asbuilt/tests/helpers/dense-fixture.ts
```

### File scope adherence

Only the two files listed in the brief's File scope were touched:
`asbuilt/tests/helpers/dense-fixture.ts` (created) and
`asbuilt/tests/dense-fixture.test.ts` (pre-existing, left as-is). Nothing
under `asbuilt/src/`, `asbuilt/vendor/`, or any cytoscape-related path was
touched, per Out of scope.

### Escalations

None. No scope breach, no plan-invalidating discovery — the plan's reference
implementation compiled and passed against the pre-existing test file
without adjustment.

## verifier — round 1

**Command 1: `bun test asbuilt/tests/dense-fixture.test.ts`**

Exit code: 0

Output (last 30 lines):
```
bun test v1.3.14 (0d9b296a)

 10 pass
 0 fail
 27 expect() calls
Ran 10 tests across 1 file. [67.00ms]
```

**Command 2: `cd asbuilt && bunx tsc --noEmit && cd ..`**

Exit code: 0

Output: (no output — clean typecheck)

**Command 3: `git add asbuilt/tests/ && git commit -m "test(asbuilt): dense flat-package fixture, field-shape 111 concepts (SPEC-004 T02)"`**

Exit code: cannot execute

Status: broken_harness — permission system blocks git commit execution. The command cannot run; permission classifier denies write access to git history on the default branch.


## adversarial-reviewer — round 1

### What I attacked

**Wrong-input / correctness attack**: independently recomputed the 111
decomposition, the 39-audited stride, and the 18-edge sparse web against
`asbuilt/src/viz.ts`'s actual `groupOf`/`isTestConcept`/`parseVizFrontmatter`
(not the report's narrative) — all check out. `groupOf` uses
`parts.length > 2` on `resource`, `isTestConcept` overrides to `"tests"`
regardless of directory, `audited = nodes.filter(n => n.enrichment !==
"none")`. The generated frontmatter (list-style `tags:`, `from: []`,
`stale: false`) parses correctly under `parseVizFrontmatter`'s actual
grammar. No randomness/clock reads in the generator. This part of the
implementer's claim survives.

**Scope audit**: `git show --stat d13077a` touches exactly the two
brief-listed files, nothing else. Clean.

**Done-check re-run — this is where it breaks.** The brief's own
`weave.speculator` field and this repo's `skills/sdlc/SKILL.md` ("All work
(spec, scoring, implementation, review) happens in the worktree") both
establish that SPEC-004 work belongs on
`.claude/worktrees/asbuilt-viz-cytoscape` (branch `asbuilt-viz-cytoscape`).
The implementer's commit `d13077a` landed on `main` in the parent repo
instead — confirmed by `git worktree list` (main repo HEAD = d13077a,
worktree HEAD = cf091c0, no common history since 7aec51a — the branches have
diverged). Re-running the done-check in the worktree fails outright:

```
$ cd .claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/dense-fixture.test.ts
bun test v1.3.14 (0d9b296a)
The following filters did not match any test files in --cwd="…/asbuilt-viz-cytoscape":
 asbuilt/tests/dense-fixture.test.ts
487 files were searched [13.00ms]
```
It only passes where the commit accidentally landed (main):
```
$ cd /Users/dustincheng/projects/speculator && bun test asbuilt/tests/dense-fixture.test.ts
 10 pass / 0 fail / 27 expect() calls
```

This is not implementer-specific: task `01-vendor-libs`'s vendor files show
the identical pattern (`asbuilt/vendor/*.js` exist only as untracked files
in the main repo, absent from the worktree), and that task's own review
already flagged checking "both `main` and `asbuilt-viz-cytoscape`" as
necessary — i.e., this is a wave-level harness/cwd issue (whatever executes
these tasks is not `cd`-ing into the declared worktree), not a mistake this
implementer could have caught by re-reading the brief. Fixing it by asking
this task to "redo the commit" wouldn't address the root cause — the next
task (T03/T06) would just repeat it.

Practically: `03-spike` and `06-tests-hardening` are declared as consumers
of this fixture and are meant to build on the worktree per the stream's own
declared execution model; as things stand they will not find
`asbuilt/tests/helpers/dense-fixture.ts` there.

### Verdict reasoning

The done-check fails when re-run in the location the brief/stream actually
designates as canonical for this work (blocker-level, self-verified). But
the root cause is a stream-wide execution-environment defect (also visible
in T01), not a defect in this task's file contents — which are otherwise
correct. Escalating rather than requesting task-local rework.

```json
{
  "verdict": "escalate",
  "findings": [
    {
      "severity": "blocker",
      "summary": "Commit d13077a (the task's only deliverable) landed on `main` in the parent repo instead of the `asbuilt-viz-cytoscape` worktree/branch that this stream and the repo's own SDLC skill designate as canonical for SPEC-004 work; the done-check fails when re-run in that worktree.",
      "evidence": "git worktree list: main repo HEAD=d13077a [main], worktree HEAD=cf091c0 [asbuilt-viz-cytoscape], no shared history since 7aec51a (git merge-base --is-ancestor cf091c0 d13077a -> NOT ancestor). Re-run in worktree: `bun test asbuilt/tests/dense-fixture.test.ts` -> \"did not match any test files in --cwd=.../asbuilt-viz-cytoscape\", 487 files searched. Same command on main: 10 pass/0 fail. skills/sdlc/SKILL.md:63-65: \"The SDLC workflow uses git worktrees for feature isolation... All work (spec, scoring, implementation, review) happens in the worktree.\""
    }
  ],
  "escalation": {
    "trigger": "broken_harness",
    "detail": "The execution environment for this wave is not operating inside the declared worktree (.claude/worktrees/asbuilt-viz-cytoscape) despite stream.md's weave.speculator field and skills/sdlc/SKILL.md both mandating worktree-isolated SPEC-004 work. Task 01-vendor-libs shows the identical symptom (vendor files present only as untracked files in the main repo, absent from the worktree). This is a conductor/harness cwd-targeting defect, not a per-task implementer error; task-local rework (re-doing the commit) will not fix it since the same harness will misplace the redo. Recommend routing to whoever configures the wave's execution cwd before continuing T03+."
  }
}
```

## fable — round 1

Escalation adjudicated (see escalations.md, 2026-07-16): broken_harness
confirmed — round-1 work executed in the main checkout. Conductor repair:
d13077a cherry-picked onto the branch as c743291; main reset to d037916 and
stray copies removed; `bun test asbuilt/tests/dense-fixture.test.ts` verified
green in the worktree (10 pass / 0 fail). Content was NOT modified. Round 2
job: work inside the worktree per the amended Working directory contract,
re-verify, and close out — the commit already exists on the branch; do not
re-commit the same content.

## implementer — round 1

(Dispatched as "round 1" per the launching prompt; this is the conductor's
Round-2 close-out job described immediately above — running verification
against the already-relocated commit, not new content authoring. Numbered
per the literal dispatch header to keep this an append-only, non-duplicate
section.)

### What I did

Per the brief's amended Working directory contract and the fable note above:
no new files were created and nothing was re-committed. `git log` confirms
commit `c743291` (`test(asbuilt): dense flat-package fixture, field-shape 111
concepts (SPEC-004 T02)`) is already present on the `asbuilt-viz-cytoscape`
branch in the worktree, containing both `asbuilt/tests/helpers/dense-fixture.ts`
and `asbuilt/tests/dense-fixture.test.ts` unmodified from round 1. My job this
round was solely to confirm the working-directory contract and re-run the
verification commands inside the worktree (not the main checkout, where round
1's escalation showed the commit had wrongly landed).

- Confirmed `cd .../worktrees/asbuilt-viz-cytoscape && git rev-parse
  --abbrev-ref HEAD` prints `asbuilt-viz-cytoscape` (hard gate from the
  amended file-scope contract) before touching anything.
- Confirmed via `git log --oneline -- asbuilt/tests/dense-fixture.test.ts
  asbuilt/tests/helpers/dense-fixture.ts` that `c743291` is the commit that
  introduced both files, already on this branch.
- Re-ran the brief's verification commands in the worktree and confirmed
  green (tails below).
- `git status --short` in the worktree shows only pre-existing untracked
  `asbuilt/node_modules` and `asbuilt/vendor/` (out of scope — vendor
  artifacts belong to task 01-vendor-libs) — no changes of mine to stage or
  commit, consistent with the brief's "Do NOT re-create or re-commit them"
  instruction.

Concept-count math (111 decomposition) and the enrichment-stride outcome (39
of 111 audited) are unchanged from round 1's analysis above — the file
content was not touched this round, so that analysis still applies verbatim
and is not repeated here.

### Verification command tails

**`git rev-parse --abbrev-ref HEAD`** (must print `asbuilt-viz-cytoscape`):
```
asbuilt-viz-cytoscape
```

**`bun test asbuilt/tests/dense-fixture.test.ts`** (run inside the worktree):
```
bun test v1.3.14 (0d9b296a)

 10 pass
 0 fail
 27 expect() calls
Ran 10 tests across 1 file. [109.00ms]
```

**`cd asbuilt && bunx tsc --noEmit && cd ..`** (run inside the worktree):
```
(no output — exit code 0, clean typecheck)
```

**Commit:** not run — the brief's Round-2 state explicitly instructs "Do NOT
re-create or re-commit them" since commit `c743291` already contains both
files on the branch, confirmed present above.

### File scope adherence

No files created or modified this round. Only read/verify commands were run,
all inside the worktree
`/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape`,
consistent with the amended Working directory contract. The main checkout was
not touched.

### Escalations

None. The branch check passed, the pre-existing commit was found intact and
green in the correct location, and no plan-invalidating discovery or scope
issue arose.

## verifier — round 1

**Command 1: `git rev-parse --abbrev-ref HEAD`**

Exit code: 0

Output:
```
asbuilt-viz-cytoscape
```

**Command 2: `bun test asbuilt/tests/dense-fixture.test.ts`**

Exit code: 0

Output:
```
bun test v1.3.14 (0d9b296a)

 10 pass
 0 fail
 27 expect() calls
Ran 10 tests across 1 file. [71.00ms]
```

**Command 3: `cd asbuilt && bunx tsc --noEmit && cd ..`**

Exit code: 0

Output: (no output — clean typecheck)

## adversarial-reviewer — round 1

(Functionally the follow-up review after the prior round's `broken_harness`
escalation was adjudicated and conductor-repaired — numbered "round 1" per
the literal dispatch header, consistent with how the implementer/verifier
sections above are numbered for the same reason.)

### What I attacked

**Re-verified the harness fix independently** rather than trusting the
fable/verifier narrative. Confirmed via direct commands (not report
paraphrase):

```
$ cd .claude/worktrees/asbuilt-viz-cytoscape && git rev-parse --abbrev-ref HEAD
asbuilt-viz-cytoscape
$ git log --oneline -3
c743291 test(asbuilt): dense flat-package fixture, field-shape 111 concepts (SPEC-004 T02)
cf091c0 chore(sdlc): SPEC-004 phase 2 ...
7aec51a docs(stream): open asbuilt-viz-cytoscape stream ...
$ git show --stat c743291
 asbuilt/tests/dense-fixture.test.ts    | 162 +++++++++++++++++++++
 asbuilt/tests/helpers/dense-fixture.ts |  73 +++++++++++++++
 2 files changed, 235 insertions(+)
```

Scope clean — only the two brief-listed files. Confirmed `main` no longer
carries the stray commit: `git log --oneline -5` on main now starts at
`d037916` (not `d13077a`), and `find asbuilt/tests -iname "*dense-fixture*"`
in the main checkout returns nothing — no duplicate copy left behind.

**Done-check re-run, independently, in the worktree:**

```
$ bun test asbuilt/tests/dense-fixture.test.ts
bun test v1.3.14 (0d9b296a)

 10 pass
 0 fail
 27 expect() calls
Ran 10 tests across 1 file. [72.00ms]

$ cd asbuilt && bunx tsc --noEmit; echo exit=$?
exit=0
```

Both green. `git diff --stat HEAD -- asbuilt/tests/` and
`git status --porcelain -- asbuilt/tests/` are both empty — content is
byte-identical to what the prior round's adversarial pass already
independently checked against `viz.ts`'s actual `groupOf`/`isTestConcept`/
`parseVizFrontmatter`/audited-counting logic (confirmed present at
`asbuilt/src/viz.ts:31,114,118,168,213`), so I did not need to re-derive
that analysis — it wasn't touched.

**Cross-check against spec R7** (`docs/specs/asbuilt-viz-cytoscape/spec.md:66-68`):
"≥50-concept group plus ≥40 test concepts" — fixture's `cmd/cli` group is
54 sources + 42 tests, satisfying both floors. AC1 (no global `tests`
bucket, path-grouped compounds) is explicitly T04/T06 territory per the
brief's Out-of-scope list, correctly deferred via the flip comment in the
test file (`dense-fixture.test.ts:9-13,61-62`).

### Prior finding disposition

Round 1's `blocker`/`broken_harness` finding (commit landed on `main`
instead of the worktree) is **resolved with sound evidence, not disputed
away**: the conductor's repair (cherry-pick to `c743291` on the correct
branch, `main` reset to `d037916`) is independently reproducible by me
right now, and the done-check passes in the worktree — the environment
this task's own file-scope contract designates as canonical. Dropping the
finding.

### Verdict reasoning

Nothing survives the attack. Scope is clean, done-check is green in the
correct location (independently reproduced), content matches spec R7 and
the brief's required-content list, and the prior blocker is genuinely
fixed with fresh, reproducible evidence — not merely asserted.

```json
{
  "verdict": "pass",
  "findings": [],
  "escalation": null
}
```
