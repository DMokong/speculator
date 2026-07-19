# Eval AC5 — every existing interaction survives the engine swap

Observable success: A user familiar with the current viz finds every
interaction working the same way in the new one: hovering a node shows the
tooltip with the same information (identity, group, symbol count, enrichment
state); clicking opens the detail panel with the same content; typing in
search dims everything that doesn't match; the state and area filters narrow
the view exactly as before.

Anti-patterns this catches: quietly shipping the engine swap minus
"inconvenient" interactions — a regression the spec's journeys forbid
("all current interactions intact").

Would fail if:
- Hover shows nothing, or less information than the current tooltip.
- Clicking a node no longer opens the detail panel, or the panel loses
  content it has today.
- Search stops dimming non-matches, or matches the wrong fields.
- Any state/area filter disappears or filters differently than today.
