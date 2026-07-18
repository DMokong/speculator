# Eval AC9 — open vocabulary tolerated, malformed input contained

Observable success: A novel single-token type outside the curated list
(e.g. `Migration`) flows through and renders as written — OKF's tolerant-
consumer contract honored, no enum police. Malformed values (empty,
multi-line, non-string) hit reclassify's all-or-nothing validation with a
nonzero exit, and on the fold path are treated as absent and disclosed as
skipped-invalid rather than aborting the other drafts.

Anti-patterns this catches: fold-time enum rejection (fighting the
format's open-vocab contract); one malformed field aborting an otherwise
valid enrichment application; malformed values landing in frontmatter and
corrupting later parses.

Would fail if:
- A novel-but-well-formed type is rejected or normalized away.
- A malformed value is ever written to a concept file.
- One bad draft field prevents the other drafts from folding.
