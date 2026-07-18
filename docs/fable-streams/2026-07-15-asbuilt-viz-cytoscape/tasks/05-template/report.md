# Report — 05-template

## fable — round 0 (interruption recovery)

The first T05 dispatch (wf_96a73727-af8, opus) was interrupted by a
process/session transition (MCP servers dropped; the background fork
checkpoint "could not be resumed"). It left `asbuilt/src/viz-template.html`
**modified but uncommitted**, with no report and no verifier/reviewer pass —
a crash artifact, not pipeline-verified work.

Conductor assessment (opus-emulation tier, first-hand):
- The uncommitted template was a complete-looking rewrite (325 lines changed,
  cytoscape present, SVG sim removed) and BUILT clean: dense fixture →
  586,640 B (~573 KB, under the 700 KB budget), vendor inlined, no placeholder
  left. So the implementer likely finished the code before the crash.
- But "it builds" ≠ verified: no browser render check, no interaction check,
  no determinism/no-clock check, and crucially no verifier or adversarial
  reviewer ran. The resume mechanism was already dead.

Ruling: preserve the artifact for reference
(`scratchpad/t05-crash-artifact/viz-template.interrupted.html`), reset the
template to the clean T04 state (6bb6a36), and re-dispatch T05 fresh through
the full implementer→verifier→reviewer pipeline. Trust comes from the
pipeline, not from a crash artifact that happens to build. Fix counter stays
0 (no adversarial round was consumed).
