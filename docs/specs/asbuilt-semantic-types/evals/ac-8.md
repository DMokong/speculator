# Eval AC8 — the agent contract asks for the judgment, testably

Observable success: The shipped AGENT.md instructs the generator to emit
suggested_type, names the curated vocabulary, and tells it to omit when
unsure — and the contract test reads THOSE words from the live file, so
contract drift fails the suite. The information-discard defect cannot
silently return.

Anti-patterns this catches: tests hand-copying the contract (the suite's
catalogued coupling gap — a test that measures its own copy); vocabulary
drifting between the agent prompt and the tests.

Would fail if:
- AGENT.md gains the duty but no test parses it live.
- The test pins a paraphrase or duplicate instead of the shipped file.
- The omit-when-unsure instruction is missing (forcing confident-sounding
  guesses is worse than Module).
