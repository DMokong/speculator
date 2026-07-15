# Eval AC8 — the layout is reproducible, not a dice roll

Observable success: A user opens the same viz.html twice in the same browser
and sees the same arrangement both times — clusters in the same places, nodes
in the same relative positions. Reloading never reshuffles the map. Two
colleagues discussing "the cluster at the top left" of the same file in the
same browser are looking at the same thing.

Anti-patterns this catches: randomness smuggled in by the new layout engine —
a reproducible artifact with an unreproducible rendering breaks the "same
input, same picture" property the tool's review workflows rely on.

Would fail if:
- Reloading the same file produces a visibly different arrangement.
- The arrangement depends on load timing, animation racing, or any source of
  randomness rather than only on the bundle data.
- Layout reproducibility holds only for small bundles but degrades on dense
  ones.
