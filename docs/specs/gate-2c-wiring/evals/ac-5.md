# Eval: AC5 — Spec-fidelity failure escalates instead of retrying

**Observable success (without source code access)**:
When the comprehension score reveals the implementation doesn't match spec intent (spec_fidelity below minimum), the developer sees an immediate human-escalation message containing the explanation artifact — not a silent second attempt. When instead only the artifact quality is weak (coverage/accuracy/scope dimensions), exactly one automatic re-dispatch happens before escalation.

**Anti-patterns this eval would catch**:
- The pipeline retries a spec_fidelity failure (would fail — re-explaining cannot fix a wrong implementation; retrying buries the signal)
- Unlimited re-dispatch loops on artifact-quality failures (would fail — the budget is exactly one)

**Would fail if**:
- A fidelity failure triggers any re-dispatch
- An artifact-quality failure escalates without its one permitted retry, or retries more than once
- The escalation message omits the artifact (the human needs the evidence of where intent diverged)
