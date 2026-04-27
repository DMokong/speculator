# Speculator: Quality In, Quality Out

*A manifesto on why specification quality is the missing measure in AI-assisted development.*

---

## I. The Missing Measure

We've gotten pretty good at measuring output.

Test coverage, code quality scores, performance benchmarks, security scans — the industry has built an impressive stack of tools that tell you whether your code is any good. [SWE-bench](https://www.swe-bench.com) measures how well AI writes code. [FeatureBench](https://github.com/anthropics/featurebench) measures how well it ships features. Linters catch style violations. Type checkers catch logic errors. CI pipelines gate on all of it.

That measurement is important. It works. I'm not here to tell you it's wrong.

But we're skipping something. Arguably the most important something.

Nobody measures the *input*. The specification — the document that tells the agent what to build, why it matters, and how to know when it's done. We pour enormous effort into verifying that code is correct, but almost none into verifying that the instructions that *produced* the code were any good in the first place.

Here's the thing: a high-quality specification means all those downstream measurements have fewer findings. It's not that your test failures are a problem with testing — it's that many of them are problems that should never have existed. They trace back to vague requirements, missing edge cases, and undercooked acceptance criteria. To gaps in the spec.

Nate B Jones called the jagged frontier [a measurement error](https://natesnewsletter.substack.com/p/cursors-coding-agents-solved-a-math) — it wasn't that AI couldn't code, it was that our harnesses couldn't guide it. Four independent labs converged on the same pattern: decompose, parallelize, verify, iterate. The common thread wasn't smarter models. It was structure before execution.

After decades of building software, I watched the industry obsess over output metrics while skipping the input that determines whether the output is right in the first place.

We have a missing measure. And there's a reason nobody noticed it was missing.

## II. The Artisan's Dilemma

Think about the world where we came from. For most of software's history, measuring the input didn't matter — because the best developers could drive without a map. The route was internalized through years of experience. Which is exactly why this gap is invisible to the people most qualified to see it.

For most of my career, the best developers I worked with were artisans. They could take a napkin sketch — a half-formed idea, a vague Jira ticket with three bullet points — and ship something magnificent. The specification was in their head. Intent was ingrained through years of domain knowledge, pattern recognition, and instinct honed across thousands of production incidents and late-night debugging sessions.

They'd adjust mid-flight, course-correct by feel. "That API response doesn't feel right — let me restructure the data model." "The user wouldn't expect this flow — I'll add a confirmation step." These weren't in any spec. They were the developer's taste, their craft, their accumulated wisdom about how software should work.

Yes, there was scope creep. Yes, test cases got missed. Yes, the PR description said "minor refactor" on a 2,000-line diff. But the output was often *right* in ways the specification never captured. It was the wild west, and honestly? It was glorious.

That era ended. Not because the artisans disappeared — but because their collaborator changed.

AI agents are remarkable. They can reason about complex systems, decompose problems into parallel workstreams, and course-correct within well-defined spaces. But they face what I call the **thin air problem**: when a specification is undercooked, agents don't have decades of domain intuition to fill the gaps. They'll reason their way to *a* decision, but it won't always be *the right* decision. That "doesn't feel right" instinct — the taste, the judgment, the pattern recognition that takes years to develop — is precisely what agents can't yet replace.

The goal isn't to pretend agents are artisans. It's to minimize the surface area where the judgment gap matters. A better specification means fewer moments where the agent has to improvise from thin air. The craft that used to live in the developer's head now needs to live in the specification.

Not because specs are bureaucracy. Because specs are how you transfer artisan knowledge to agents.

That's the dilemma: the developers who most need to write great specs are the ones who never had to before. Their expertise was always implicit. Now it needs to be explicit — not for a human colleague who shares their context, but for an agent that starts from zero every time.

## III. The Gap Nobody's Measuring

If this were just a theoretical concern, I'd write a blog post and move on. But the data backs it up.

In March 2026, we surveyed the landscape: 7 Claude Code SDLC plugins, 5 framework and methodology publications, the SWE-bench family of benchmarks, and requirements engineering standards going back decades. We were looking for one thing: does anyone quantitatively evaluate feature-level specification quality across multiple dimensions?

We couldn't find one.

[SWE-bench](https://www.swe-bench.com) measures code completion — given a bug or feature request, how well does an AI resolve it? That's output measurement. [ISO 29148](https://www.iso.org/standard/72089.html) provides guidelines for requirements documentation — useful, but it's a standard for individual requirements, not a scoring rubric for complete feature specifications. Bill Wake's [INVEST framework](https://xp123.com/articles/invest-in-good-stories-and-smart-tasks/) (2003) evaluates user story quality with six criteria — but user stories aren't specifications, and INVEST is a checklist, not a quantitative score.

None of these evaluate a complete feature specification on a multi-dimensional rubric that produces a numeric score you can track over time.

The Claude Code plugin ecosystem tells the same story. There are 5+ SDLC plugins — [AI-SDLC](https://ai-sdlc.io), [spectacular](https://github.com/arittr/spectacular), [danielscholl/claude-sdlc](https://github.com/danielscholl/claude-sdlc), and others from ajaywadhara, iamladi, and closedloop-ai. Most go wide with kitchen-sink features: scaffolding, task management, code generation, testing, deployment. None score spec quality quantitatively. The specification is treated as an input to be consumed, not an artifact to be evaluated.

Meanwhile, the *concept* of quality gates on specifications is being validated from multiple directions:

- [Tikal's 12-Factor Agentic SDLC](https://github.com/tikalk/agentic-sdlc-12-factors) dedicates two of its twelve factors — Factor 6 (quality gates) and Factor 7 (adaptive quality gates) — to the idea that AI-assisted development needs measurable checkpoints.
- [Amplify Partners' thesis on the agent-first developer toolchain](https://www.amplifypartners.com/blog-posts/the-agent-first-developer-toolchain-how-ai-will-radically-transform-the-sdlc) argues that "CI becomes a trust engine" — trust built through verified quality, not reputation.
- [MIT's Missing Semester](https://missing.csail.mit.edu/2026/agentic-coding/) added agentic coding to its core CS curriculum in 2026 — teaching students to work *with* agents, not just write code.

The industry recognizes that AI development needs quality infrastructure. But the measurement is missing at the most critical point: before a single line of code is written.

From what we've seen, the industry has a spec quality problem and no spec quality metric.

## IV. How We Measure Spec Quality

So we built one.

[Speculator](https://github.com/DMokong/speculator) evaluates feature specifications using an LLM-as-judge rubric with six weighted dimensions:

| Dimension | Weight | What It Catches |
|-----------|--------|-----------------|
| **Completeness** | 0.20 | Missing sections, hollow placeholders, specs that look complete but have no substance |
| **Clarity** | 0.20 | Vague language ("should be fast" vs "p95 latency < 200ms"), ambiguous requirements, weasel words |
| **Testability** | 0.20 | Acceptance criteria that can't be objectively verified — "user experience should be good" vs "form submits in < 2 seconds with success toast" |
| **Intent Verifiability** | 0.15 | Purpose capture, anti-pattern documentation, critical user journeys — does the spec convey *why*, not just *what* |
| **Feasibility** | 0.15 | Dependencies unverified, architecture hand-waved, risks unidentified — specs that sound great but can't actually be built |
| **Scope** | 0.10 | Feature creep, kitchen-sink specs, "while we're at it" scope expansion — right-sizing for a single deliverable |

Why these six? Because each one catches a different category of spec failure that leads to downstream problems.

Completeness and Clarity are table stakes — they catch the obvious gaps. Testability forces specificity: if you can't write a test for your acceptance criterion, the agent can't verify it implemented the right thing. Feasibility catches wishful thinking before it becomes a failed sprint.

But the dimension I'm most proud of is **Intent Verifiability**. This is the one that catches letter-vs-spirit gaming — when an implementation technically satisfies every written requirement but misses the actual purpose.

Here's a concrete example. Your spec says: "Users can delete their account." An agent implements soft-delete — marks the account as inactive but keeps all personal data in the database. Letter of the requirement? Met. Spirit of the requirement? Violated. The user wanted their data *gone*.

Intent Verifiability checks whether a spec captures enough *purpose and intent* to prevent this gap. It's the same gap that human artisans bridged instinctively — they knew the user meant "delete my data," not "hide my profile." Agents need that intent made explicit.

A note on scoring: a 7 means ready for implementation. A 9 is rare. Most first drafts land between 5 and 7 — and that's fine, because the score isn't the point. The improvement is.

Which brings me to the result that convinced me this works.

During the first end-to-end pipeline run of Speculator's autonomous mode (SPEC-011), the spec-scorer agent assessed the spec at 7.7. Not bad — above the implementation threshold. But the self-improvement loop engaged anyway: structured feedback identified threshold inconsistencies, missing acceptance criteria detail, and user journey gaps. After revision — without changing the core requirements, without altering what the feature *does* — the spec scored 8.4.

The initial score was from the interactive scoring round; the final 8.4 is preserved as a [YAML evidence artifact](https://github.com/DMokong/speculator/blob/main/docs/specs/sdlc-run-design/evidence/gate-1-scorecard.yml). The requirements didn't change. The spec just got *better* by being measured. Gaps were closed. Ambiguities were resolved. Edge cases were surfaced. All before a single line of implementation code was written.

That's the thesis in action. Quality in, quality out.

## V. Continuous Quality, Not Gatekeeping

I want to be clear about what this is *not*. This is not waterfall. This is not a gate that blocks you from writing code until a committee approves your spec. This is continuous quality integrated into the flow.

Speculator runs a six-stage quality pipeline — four required gates plus two opt-in eval gates that bracket implementation:

1. **Spec Quality** — Is the specification good enough to implement?
2. **Eval Intent** *(opt-in, pre-implementation)* — Do our acceptance criteria have authored evals that capture user-observable intent, before the code creates an attractor?
3. **Code Quality** — Does the implementation meet standards (tests, coverage, build/lint/types)?
4. **Eval Quality** *(opt-in, post-implementation)* — Are our tests good *instruments* — would they detect a spec violation, or just an internal-API change?
5. **Code Review** — Does a reviewer (human or AI) approve the changes? Includes a mandatory secrets scan and a skill-description trigger eval.
6. **Evidence Package** — Is every gate's artifact present, are blocking flags resolved, and is the work mergeable?

Gates 2 (eval intent) and 4 (eval quality) are opt-in because mature teams need them and starting teams shouldn't be slowed by them — but they're how we close the loop on the part of the thesis that's hardest to defend without measurement: that the *spirit* of the spec, not just its letter, made it through.

The spec quality gate uses a **trust ladder**: the spec's score determines how much autonomy the implementation gets. Score high enough, and the pipeline runs fully autonomously — scoring, planning, implementing, reviewing, and merging without intervention. Score lower, and you get guided mode with checkpoints. Score below the threshold, and the pipeline stops to ask questions.

Here's the key design decision: **trust is per-spec, not persistent.** Every specification starts fresh. There's no reputation score, no accumulated trust from previous work. Why? Because every spec is different. The complexity, the domain, the risk profile, the dependencies — too many factors and moving parts to carry trust from one spec to the next. A developer who wrote a perfect auth spec might write a mediocre payments spec. Trust the work, not the history.

Quality input doesn't start at the spec, though. It starts before the spec even exists. [Superpowers](https://github.com/obra/superpowers), Jesse Vincent's Claude Code skill framework, includes a structured brainstorming process: exploring intent, asking clarifying questions, proposing approaches with trade-offs, and getting design approval before implementation begins. We recommend Superpowers as a dependency because brainstorming is the spec quality input pipeline — it's what transforms a vague idea into a specification worth scoring. Install it via `claude plugin install superpowers@claude-plugins-official`.

The self-improvement loop has an intentional design: the trigger threshold (8.0) is set *above* the full-auto threshold (7.8). That means even specs that are good enough to run autonomously still engage with feedback. You don't skip the gym because you're already fit. As Nate B Jones argues in ["Your Prompts Are Disposable"](https://natesnewsletter.substack.com/p/the-most-expensive-ai-mistake-isnt), rejection and iteration aren't failures — they're compounding assets. Each round of improvement makes the next spec better.

We build for Claude Code first. The harness matters — the quality of the development environment determines the quality of the output. That's a prescriptive position, and positions can change. A better harness might appear tomorrow. But today, Claude Code is where we do our best work, and Speculator is built to leverage its strengths.

## VI. Specs as Living Organisms

Here's where I want to push the thinking forward, beyond what Speculator does today.

Specs don't die when features ship.

Think about it. The spec that defined your authentication system six months ago — it's still relevant. Maybe the requirements evolved. Maybe a new regulation changed the data retention rules. Maybe a performance optimization invalidated an assumption. The spec is still the best record of *why the system works the way it does*.

The [Scott Logic blog](https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html) raised this critique of spec-driven tools: specs become stale after implementation, creating a false sense of documentation. It's a valid concern — if you treat specs as write-once artifacts. But what if specs are living documents? What if they evolve as the code evolves?

New specs build on old ones. Conflicts between specs surface architectural tensions. Superseded specs aren't deleted — they're the geological record of *why decisions were made*. "We chose PostgreSQL over DynamoDB because of X" is still valuable context two years later, even if the spec that captured that decision has been superseded three times.

Over time, a well-maintained spec history becomes something more than documentation. It becomes the blueprint and navigation system for the entire codebase's intent. Context changes as code evolves, but spec history with proper handling provides continuity of intent across time. It paints the picture of how the current state *became* — and illuminates what the future state *could be*.

This is where Speculator is heading:

**Spec drift detection.** Measuring the divergence between the living spec and the living code. Did the implementation stay true to the specification? Did scope creep happen? Did a "quick fix" silently invalidate an acceptance criterion? [Spec-Kit-Antigravity](https://github.com/compnew2006/Spec-Kit-Antigravity-Skills) has explored this concept with their `/util-speckit.diff` tool — diffing spec against implementation. We want to take it further. If quality in matters, then quality *through* matters too.

**Continuous cross-spec evaluation.** Finding conflicts, inconsistencies, and superseded assumptions across the full spec corpus. When a new spec contradicts an old one, that's not a bug — it's a signal. It might be intentional evolution, or it might be an oversight. Either way, surfacing it adds context and weight to future decisions.

**Historical provenance.** Any line of code can be traced back through implementation → spec → requirement → intent. The spec history *is* the codebase's institutional memory. Not in a developer's head, not in tribal knowledge, not in a Confluence page nobody reads — in a structured, queryable record that agents can reason about.

## VI½. Dark Code Is the Failure Mode We're Building Against

While we were building Speculator, [Nate B Jones described the failure mode](https://natesnewsletter.substack.com/p/your-codebase-is-full-of-code-nobody) we were trying to prevent: **dark code** — production software that was generated, passed tests, shipped, and was *never understood by anyone at any point.* Distinct from technical debt, enabled by two breaks: (1) AI separates generation from comprehension, and (2) automated quality gates bypass the need for human understanding.

The Amazon "Kiro" case study is the load-bearing example: an 80% AI-coding mandate plus 16K engineer layoffs, an autonomous tool deletes an entire environment, 13 hours of downtime, and the discovery that the senior engineers who *understood what the code was touching* were the ones who'd been let go. Jones's diagnosis generalized a week later: *"production is cheap, comprehension is scarce."*

His three fixes map directly onto Speculator's pipeline:

1. **Spec-driven dev** — comprehension lives in the spec. → Gates 1 and 2a.
2. **Comprehension gates** — PRs blocked unless a human (or agent) can explain what the code does. → **Gate 2c, the next thing we're building.**
3. **Context engineering** — failure modes and *why-wired-this-way* notes on high-risk modules. → The Gate 2c artifact, dual-purposed as durable per-AC explanation that lives next to the code.

This is why Speculator's roadmap leads with Gate 2c rather than spec drift detection or other line items. The thesis isn't just *"quality in = quality out"* — it's *"if no one understands what shipped, neither does."* Closing that loop is what the rest of the gate model is in service of.

## VII. The Call

We need a spec quality benchmark.

SWE-bench gave us a way to measure how well AI writes code. It created a shared vocabulary, a leaderboard, a way to compare approaches. Before SWE-bench, "our model writes great code" was a marketing claim. After SWE-bench, it was a testable hypothesis.

We need the same thing for specifications. A scored dataset of specs rated across multiple dimensions. Open-source, community-driven, continuously evolving. How good is this spec? Not "does it look professional" or "is it long enough" — does it contain enough information, with enough clarity, with enough testable criteria, with enough captured intent, to produce a correct implementation?

In our survey of the landscape, we found no such benchmark. Nobody has built this.

We're starting.

**Speculator** — spec + evaluator — is a Claude Code plugin that measures what nobody else measures: the quality of the specification that determines the quality of everything downstream. It's open-source and available on [GitHub](https://github.com/DMokong/speculator).

The roadmap:

- **Spec drift detection** — measuring divergence between spec and implementation over time
- **Spec quality benchmark dataset** — the SWE-bench for specifications, community-contributed and openly scored
- **Post-implementation quality tracing** — connecting downstream findings back to spec gaps
- **Specs as living organisms** — continuous evaluation across the full spec corpus

This is our starting point, not our final answer. The rubric will evolve. The dimensions might shift. The weights will be tuned by real-world data. But the thesis won't change:

**Quality In = Quality Out.**

The best code comes from the best specifications. The best specifications come from measurement, iteration, and a refusal to skip the most important step.

If you think we're measuring the wrong dimensions — tell us. If you have specs you'd contribute to a benchmark dataset — we want them. If you think this whole approach is wrong — challenge us. The rubric gets better the same way specs do: by being measured and improved.

The missing measure isn't missing anymore.

---

*Speculator is open-source under the MIT license. [GitHub](https://github.com/DMokong/speculator) | Install: `claude plugin install speculator@dmokong-plugins`*

*Written by Dustin Cheng — builder, thinker, and reluctant manifesto author.*
