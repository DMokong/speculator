# Eval AC5 — semantic types survive the refresh cycle

Observable success: A concept typed `Service` keeps `type: Service` after
refresh processes its resource — whether the resource changed or not, and
whether the type was assigned by an enrichment fold, the backfill, or a
human editing frontmatter by hand. The preservation is pinned by a test
naming this AC, so any future change to the refresh path that starts
re-deriving types from filenames again fails the suite loudly.

Anti-patterns this catches: the mechanical refresh path downgrading
enriched judgment back to Module — which would make every semantic type
(including a human's manual correction) a time bomb that detonates on the
next refresh.

Would fail if:
- Refresh rewrites a semantic type to the filename-derived default.
- A hand-edited type survives fold and reclassify but not refresh (the
  correction journey must hold across ALL three rewrite paths).
- The preservation behavior exists but no test names it (unpinned
  invariants are the suite's standing anti-pattern).
