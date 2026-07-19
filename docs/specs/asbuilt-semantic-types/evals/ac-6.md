# Eval AC6 — one command retypes an already-enriched bundle

Observable success: Given a reclassification artifact for an enriched
bundle, one CLI run rewrites exactly the type line of each listed
Module-typed enriched concept — body bytes untouched — and prints
applied/preserved/skipped counts. Dustin's field bundles (68×Module) become
a typed inventory in a single deterministic step, without re-enrichment
cost.

Anti-patterns this catches: backfill that "improves" content while it's
there (frontmatter-only is the contract); backfill requiring full
re-enrichment (blocked anyway by the refresh hash early-return, and
needlessly expensive).

Would fail if:
- Any body byte changes, or any unlisted concept is touched.
- The summary counts don't reconcile with the artifact's entries.
- The applier calls an LLM or reads anything beyond the bundle + artifact.
