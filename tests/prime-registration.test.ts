// SPEC-052 AC7 + contract pins for the sdlc-prime skill (drift-test style).
//
// The prime skill is markdown (agent-executed), so its *registration* and its
// *stable contracts* are what CI can hold still: the router must dispatch the
// subcommand, the docs must name it, and the marker strings / delegation rules
// the skill promises must appear verbatim in the skill file. A behavioral
// fixture harness for the skill's runtime effects lives in
// tests/prime-fixture-assertions.test.ts (gated on an agent-run output dir).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("SPEC-052 AC7 — prime is registered and documented", () => {
  test("router table dispatches the prime subcommand for both prefixes", () => {
    const router = read("skills/sdlc/SKILL.md");
    expect(router).toContain("| `/sdlc prime` or `/spec prime` |");
    expect(router).toContain("invoke `sdlc-prime` skill");
  });

  test("router description advertises the prime subcommand", () => {
    const router = read("skills/sdlc/SKILL.md");
    expect(router.slice(0, router.indexOf("---", 4))).toContain("prime");
  });

  test("prime joins start/doctor in the worktree-preamble skip list", () => {
    expect(read("skills/sdlc/SKILL.md")).toContain(
      "commands that don't need a spec: `/sdlc start`, `/sdlc doctor`, `/sdlc prime`",
    );
  });

  test("README Commands table lists /spec prime", () => {
    expect(read("README.md")).toContain("| `/spec prime` |");
  });

  test("CHANGELOG names the sdlc-prime skill", () => {
    expect(read("CHANGELOG.md")).toContain("`sdlc-prime` skill");
  });
});

describe("SPEC-052 R2/R4/R6 — skill contracts pinned verbatim", () => {
  const skill = read("skills/sdlc-prime/SKILL.md");

  test("marker strings are the released contract, verbatim", () => {
    expect(skill).toContain("<!-- speculator:prime:start -->");
    expect(skill).toContain("<!-- speculator:prime:end -->");
  });

  test("malformed markers are a hard stop (no repair heuristics)", () => {
    expect(skill).toContain("Hard stop on malformed markers");
    expect(skill).toContain("Do not attempt repair heuristics");
  });

  test("config generation is delegated to doctor --init, never emitted by prime", () => {
    expect(skill).toContain("Doctor is the single owner of config generation");
    expect(skill).toContain("emit config YAML itself");
  });

  test("section budget and provenance stamp are stated", () => {
    expect(skill).toContain("under 60");
    expect(skill).toContain("plugin v{VERSION}, {DATE}");
  });

  test("read-only outside the fence", () => {
    expect(skill).toContain("Outside the markers, prime is read-only");
  });

  test("skeleton caution wording is pinned in lockstep with the --force guard (SPEC-054 AC4)", () => {
    // The caution spans a line break in the template; pin its two stable fragments.
    expect(skill).toContain("it refuses without --force");
    expect(skill).toContain("forcing destroys audited prose");
    expect(skill).toContain("update with refresh.ts ALONE");
  });
});
