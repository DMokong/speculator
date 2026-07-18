# Eval AC1 — an agent's role judgment lands in the type field

Observable success: After folding a generator artifact whose enrichment
draft says a concept is a Service, opening that concept file shows
`type: Service` in its frontmatter where `type: Module` stood before —
and the frontmatter's field order is untouched, so diffs show exactly one
changed line. The judgment that previously lived only in Explanation prose
is now machine-readable.

Anti-patterns this catches: producing the classification but discarding it
(the original defect — information generated then dropped at the contract
boundary); smuggling the type into prose or tags instead of the type field.

Would fail if:
- The folded concept still reads `type: Module` despite the draft carrying
  a suggestion.
- The type lands but other frontmatter fields reorder or rewrap (churn
  beyond the one-line change).
- The suggestion is read from anywhere other than the draft entry in the
  generator artifact the evidence points to.
