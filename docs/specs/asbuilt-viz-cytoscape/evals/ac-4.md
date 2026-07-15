# Eval AC4 — regenerating an unchanged bundle changes nothing

Observable success: A maintainer rebuilds the viz from an unchanged bundle and
manifest, then compares the new file to the previous one: they are identical,
byte for byte (empty diff, matching checksums). Drift-diff workflows that
watch the artifact stay quiet when nothing real changed.

Anti-patterns this catches: "Baking layout coordinates into the artifact"
(spec anti-pattern #3) — platform-varying numbers in the file would make
identical inputs produce differing bytes.

Would fail if:
- Two consecutive builds from identical inputs differ anywhere (timestamps,
  reordered entries, embedded random values, or environment-dependent
  numbers).
- The build result depends on when or on which machine it ran rather than
  only on the bundle contents and the date the operator supplied.
