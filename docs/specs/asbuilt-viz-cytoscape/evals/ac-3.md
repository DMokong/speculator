# Eval AC3 — fully functional offline, from a single file

Observable success: A user double-clicks the generated viz.html from `file://`
on a machine with networking disabled and gets the complete experience — graph
renders, zoom/pan works, tooltips, detail panel, search, and filters all
function. Watching a network inspector during load and interaction shows zero
outgoing requests.

Anti-patterns this catches: "Loading any library from a CDN at build or view
time" (spec anti-pattern #4).

Would fail if:
- The page renders blank, partially styled, or without the graph when offline.
- Any interaction (zoom, hover, search) degrades or errors without network.
- A network inspector records any request at load or during use.
- The artifact arrives as multiple files that must travel together.
