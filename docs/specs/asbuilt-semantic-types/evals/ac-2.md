# Eval AC2 — a settled identity does not flap

Observable success: A concept already typed `Model` (by an earlier fold or
a human edit) goes through another enrichment fold whose draft now says
`Service`. Afterwards the file still reads `type: Model`, and the fold's
summary discloses that a suggestion was preserved-over rather than applied
— the operator can see the disagreement without the file churning.

Anti-patterns this catches: suggestion churn (types flapping between
enrichment runs) and silent clobbering of human corrections — the two
failure modes first-semantic-wins exists to prevent. The full correction
journey: a human fixes a misclassified concept by editing its frontmatter
type; that edit then survives every later fold (this eval), every later
reclassify run (AC7's already-semantic skip), and every refresh (AC5).

Would fail if:
- The later suggestion overwrites the earlier semantic type.
- The preserved disagreement is invisible (no count/mention in the summary).
- Preservation is implemented by dropping the suggestion pre-fold (so the
  summary CAN'T disclose it) rather than by an explicit precedence rule.
