# Eval AC6 — the existing behavioral guarantees still hold and still have teeth

Observable success: Running the project's viz test suite passes, and the
guarantees those tests encode remain demonstrably true of the new artifact:
the embedded data reports correct concept/audit counts, cross-file
relationships collapse to file links exactly as before, hostile content in a
bundle (e.g. a literal `</script>` inside a concept) cannot break out of the
page, and repeated builds are identical. The old "all tests group together"
expectation is visibly replaced by an assertion of the new grouping contract,
with the supersession of the earlier decision recorded where the assertion
lives.

Anti-patterns this catches: making the suite green by deleting or gutting the
assertions instead of preserving their intent under the new engine.

Would fail if:
- Any preserved intent (counts, edge collapsing, escaping, determinism) stops
  being asserted or stops being true.
- The grouping assertion is silently removed rather than updated, or the
  supersession of the prior decision goes unrecorded.
- The suite needs network access or a special environment to pass.
