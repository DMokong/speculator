# Who Measures the Measurer?

> **DRAFT for dmokong.substack.com** — third in the series after "The Tax Nobody's Measuring"
> and "The Specification Tax." Alternative titles: "The Day My Quality Tool Audited Itself" ·
> "A Null Result Is Still a Result." Every number links to a committed artifact in the
> [Speculator repo](https://github.com/DMokong/speculator).

---

I build a tool called Speculator. Its entire thesis fits on a bumper sticker: *quality in,
quality out*. Measure the specification before you build, and everything downstream gets
better. I've written two essays in this series arguing that the spec is the most important
artifact nobody measures.

Last week I pointed a deep multi-agent review at Speculator itself. Twenty-three agents, seven
subsystem maps, four adversarial critics. The finding that mattered most fit on a bumper
sticker too:

**The tool that measures spec quality had never measured its own measurement.**

Not "had weak evidence." Had *zero valid data points* — and one invalid one. The headline
benchmark I'd been citing was a feedback loop where a judge scored specs that had been revised
to that same judge's feedback, with no control arm. The autonomy thresholds that decide
whether an agent runs unsupervised turned on a 0.2-point score distinction — and nobody knew
whether the judge could even reproduce its own scores to within 0.2. The pre-commit quality
hook, the thing that nags you about unscored specs? It had *never fired*. Not once. The
matcher syntax was wrong, and nothing verified the verifier.

If you've spent any time in ops, you know this failure class. It's the monitoring system with
no heartbeat check. It's the backup that's never been restored. I've been preaching
measurement while running uncalibrated instruments, and the only reason I can write this
paragraph without flinching is that the fix was so much more interesting than the embarrassment.

## Instrument first, claims second

Here's the discipline the review forced, in the order it forced it:

**1. Measure the noise floor.** Before you trust a judge's score, score the same thing five
times and look at the spread. We ran a test-retest study on fixed specs with a pinned scorer
and the production rubric. Result: sigma of **0.18–0.24 on polished specs**, and **0.86** on a
rough draft. My trust ladder had been granting full autonomy on a 7.8-versus-8.0 distinction —
a gap *smaller than the instrument's own noise* on its best day. The thresholds moved to
8.3/8.5 the same afternoon, sized to the measurement instead of to vibes. ([sigma data](https://github.com/DMokong/speculator/blob/main/benchmarks/results/test-retest-sigma.yml))

**2. Run the control arm you skipped.** The old "Speculator always improves specs, 9 out of 9"
claim died under a controlled design. Two arms, same PRD, same revision budget: one arm
revises with the scorer's specific feedback, the other revises with a generic "improve this
spec" prompt. Pooled across two experiments:

| | Mean lift | Passed the gate |
|---|---|---|
| **Feedback arm** | **+2.0** | 5 of 6, almost always in one revision |
| **Control arm** | **+0.6** | 1 of 6, despite three revisions each |

Three control chains produced *zero or near-zero lift* from three full revision passes. The
specific content of the scorer's feedback — not the extra compute, not the extra passes — is
what moves a spec. That's the first claim in this series I can now make with a control arm
behind it. ([ablation data](https://github.com/DMokong/speculator/blob/main/benchmarks/results/feedback-vs-control-ablation.yml))

**3. Ask the question that could kill the thesis.** Better spec *scores* are nice. The thesis
needs more: better-scored specs should produce better *implementations*. So we ran the
expensive experiment — every spec built into a real app twice (original and improved versions),
each reviewed by functional tests and an independent judge.

The result is a null. And I'm publishing it anyway, because the *reason* it's null is the most
useful thing the whole campaign produced.

The functional-test instrument came back floor-compressed: 2–3 passes out of 20, for every
implementation, both arms, both spec versions. Why? The generated apps need live weather and
transit APIs the test harness doesn't provide — so the screenshot-driven tests were measuring
"does this app demand an API key" instead of "did the spec produce a better app." The
code-reading judge, meanwhile, showed deltas of −0.6 to +0.5 — symmetric noise around zero, in
both arms, at a sample size of two pairs per arm. ([outcome data](https://github.com/DMokong/speculator/blob/main/benchmarks/results/outcome-matrix.yml))

So: the score→outcome link is **not demonstrated, and not refuted**. It is currently
*unmeasurable*, because the outcome instrument is blunter than the effect it's looking for.
The next move isn't another run of the same experiment — it's a sharper instrument: mutation
testing (inject bugs, measure kill rates) or a harness that provisions the APIs so functional
tests can actually see the features. That's now the top of the roadmap, with data explaining why.

## The gate that pays rent

The review also forced me to finally ship the thing I'd been calling the project's #1 priority
for six weeks: a *comprehension gate*. The idea comes from the dark-code problem — software
that gets generated, passes tests, ships, and is never understood by anyone at any point. The
gate's design: after tests pass and before review, a **fresh agent that has seen none of the
implementation session** reads only the spec and the diff, cold, and has to explain what
shipped and whether it matches intent. Then its explanation gets scored.

It has run twice. It has caught a real defect both times.

Run one found that our deterministic evidence verifier had registered the gate's own evidence
format as unverifiable — the arithmetic recheck it was promised would silently never have
happened. Run two found three routing policies living in an agent file instead of the
single-source library — *the exact documentation drift that spec existed to prevent*, caught by
a cold reader who had never seen the implementation conversation.

Two for two. The pattern generalizes beyond gates, by the way: the same week, five implementer
agents all self-reported success on a consolidation change, and six independent fresh-eyes
verifiers found six blocking bugs in that "successful" work — including the release's headline
feature being wired up with a path bug that meant it would silently never run for any real
user. Self-reported success is not evidence. Cold reads are.

## A war story, since we're being honest

During the outcome experiment, one of the benchmark's implementer agents — running with
permissions wide open, as benchmark implementers do — followed its commit discipline faithfully
and committed its weather app *into Speculator's repository*. Fifteen commits of React
components and database blobs, force-added past the gitignore, pushed to main before anyone
noticed.

No harm done (nothing real was touched, history's been cleaned, and the fix — a throwaway git
sandbox in the agent's working directory — took four lines). But sit with the shape of it: an
autonomous agent, doing exactly what it was taught, in the wrong scope. That's the dark-code
problem again, wearing overalls. The answer was the same as everywhere else in this story:
don't trust the actor's discipline, verify the boundary. Who measures the measurer; who
sandboxes the sandbox-builder.

## What I'd tell you to steal

1. **Measure your judge's test-retest noise before you trust any threshold.** One afternoon,
   ~20 repeated scorings. If your decision bands are inside sigma, your process has a random
   number generator in it.
2. **Any self-improvement loop needs a control arm** — generic-revision lift is the null
   hypothesis, and in our data it's sometimes literally zero.
3. **Publish your nulls with their diagnosis.** "Unmeasurable with current instruments" is a
   finding. It tells you what to build next, and it keeps your other claims credible.
4. **Cold reads beat self-reports** — for code, for explanations, for agent work generally.
   The comprehension gate is just this principle with a rubric.

The thesis survives the week leaner and more honest: *feedback-driven spec improvement is
real and now controlled-evidence-backed; the downstream outcome link is an open question with
a named instrument problem.* That's less than I claimed two essays ago. It's also the first
version of the claim I'd defend in front of a hostile audience.

Quality in, quality out — but calibrate the scale first.

---

*Speculator is open-source: [github.com/DMokong/speculator](https://github.com/DMokong/speculator).
The full campaign — five releases in one day, the raw 23-agent review findings, every gate
artifact, and all three result sets — is committed in the repo. The day's source pack is at
[`docs/2026-06-12-validation-campaign.md`](https://github.com/DMokong/speculator/blob/main/docs/2026-06-12-validation-campaign.md).*
