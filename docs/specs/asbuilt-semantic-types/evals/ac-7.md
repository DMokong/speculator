# Eval AC7 — the applier refuses to guess

Observable success: Entries pointing at skeleton-only concepts or
already-semantic concepts are skipped with a per-entry stated reason and
the run still succeeds; an entry pointing at a concept that does not exist
fails the whole run BEFORE any file is written. A bad artifact cannot
half-apply.

Anti-patterns this catches: partial application (some files written before
an error aborts — the operator can't tell what state the bundle is in);
silently typing skeleton concepts that have no prose to justify any
judgment.

Would fail if:
- An unknown concept path produces writes before the failure.
- Skeleton-only concepts get typed (no evidence exists for the judgment).
- Skips happen without reasons the operator can read.
