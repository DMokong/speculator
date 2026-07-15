# Eval AC2 — labels reveal by zoom, never by group size

Observable success: Zoomed all the way out on a dense bundle, the viewer reads
cluster (directory) names clearly while individual file names stay hidden.
Zooming into any cluster — including the densest one — its file names appear
and are readable. Every single node's name is reachable purely by zooming,
regardless of how many files share its cluster.

Anti-patterns this catches: "Permanent label suppression keyed on group size"
(spec anti-pattern #1, the field-reverted patch) — density may cost zoom
effort, never information.

Would fail if:
- Any cluster's file names never appear at any zoom level.
- Cluster names vanish when zoomed out (the at-a-glance map goes nameless).
- Two clusters of different sizes behave differently label-wise at the same
  zoom level (size-conditional suppression smuggled back in).
- Zooming in just magnifies an overlapping label pile-up instead of resolving
  into readable names.
