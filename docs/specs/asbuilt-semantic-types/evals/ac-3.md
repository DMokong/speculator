# Eval AC3 — yesterday's artifacts fold byte-identically

Observable success: Folding a pre-existing generator artifact that has no
suggested_type fields produces concept files byte-identical to what
today's code produces — proven by round-tripping a real fixture, not by
inspection. Every existing bundle and archived artifact remains valid
input with unchanged output.

Anti-patterns this catches: backward-compatibility erosion — an additive
optional field quietly changing behavior for inputs that don't use it.

Would fail if:
- Any byte of a folded concept differs when the input artifact predates
  the feature.
- The fold summary format changes for the no-suggestion case in a way that
  breaks its existing consumers.
