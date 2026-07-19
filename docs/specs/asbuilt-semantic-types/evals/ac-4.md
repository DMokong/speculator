# Eval AC4 — the machine owns test classification

Observable success: A test-classified resource (filename test pattern)
whose draft carries `suggested_type: Service` folds to `type: Test`,
exactly as before. Test-vs-non-test remains a mechanical fact the viz and
filters can trust unconditionally — no LLM judgment can move a file across
that boundary.

Anti-patterns this catches: judgment leaking into a machine-owned field;
downstream consumers (viz test styling, tests filter) silently losing
their invariant.

Would fail if:
- Any suggestion ever lands on a test-classified concept.
- Test classification starts depending on enrichment state at all.
