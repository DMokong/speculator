# sdlc-prime fixture harness (SPEC-052)

Re-runnable behavioral verification for `skills/sdlc-prime/SKILL.md`. The skill is
agent-executed, so the harness splits into a manual execution step and a deterministic
assertion step CI-style tooling can run.

## Protocol

1. Copy the fixture inputs to a scratch dir: `cp -R tests/fixtures/prime /tmp/prime-run`
2. Have an agent execute `skills/sdlc-prime/SKILL.md` faithfully, treating each scenario
   dir as the project root, in this order:
   - `fx-ts` — first prime, then save `cp CLAUDE.md CLAUDE.md.run1`, then prime AGAIN
     (idempotency probe; same plugin version + date).
   - `fx-nots` — non-TS, no config; the user **declines** doctor scaffolding.
   - `fx-none` — no CLAUDE.md; user declines scaffolding.
   - `fx-bad` / `fx-bad2` — malformed fences (start-without-end / end-before-start);
     the skill must refuse and write nothing.
   - `fx-accept` — TS, no config; the user **accepts** scaffolding (agent performs the
     sdlc-doctor `--init` flow; prime must add nothing to doctor's output).
3. Assert: `PRIME_FIXTURE_DIR=/tmp/prime-run bun test tests/prime-fixture-assertions.test.ts`

All assertions are byte-level or structural — no judgment calls. The committed fixture
trees are the byte-preservation references; `doctor-init.reference.md` is extracted
verbatim from `skills/sdlc-doctor/SKILL.md` § `--init` (if doctor's template changes,
regenerate it the same way).

`tests/prime-registration.test.ts` (always-on in the normal suite) separately pins the
router/README/CHANGELOG registration and the skill's stable contracts.
