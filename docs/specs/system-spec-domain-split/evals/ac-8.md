# Eval: AC8 — Authors learn about domains at the moment it matters

**Observable success (without source code access)**:
An author creating a new spec from the template sees an optional domain field in the frontmatter with a short note explaining it's required at close time in split-layout projects — they can fill it now or delete it, and a single-file project author can ignore it entirely.

**Anti-patterns this eval would catch**:
- The field documented as mandatory (would fail — it's optional; single-file projects never need it)
- No authoring-time nudge at all (would fail — discovering the requirement at close time, mid-pipeline, is the bad UX this field prevents)

**Would fail if**:
- The template lacks the domain field or its explanatory comment
- The comment misstates when the field is required
