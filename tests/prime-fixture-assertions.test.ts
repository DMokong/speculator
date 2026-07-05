// SPEC-052 AC1-AC6 — deterministic assertions over an agent-executed prime run.
//
// The prime skill is executed by an agent, which CI cannot do; what CI CAN hold
// still is the *outcome contract*. Protocol (documented in
// tests/fixtures/prime/README.md): copy tests/fixtures/prime/* to a scratch dir,
// have an agent execute skills/sdlc-prime/SKILL.md against each scenario (saving
// CLAUDE.md.run1 in fx-ts before the re-prime), then run:
//
//   PRIME_FIXTURE_DIR=<scratch> bun test tests/prime-fixture-assertions.test.ts
//
// Without PRIME_FIXTURE_DIR the suite is skipped (it is an on-demand harness,
// not a unit suite). The committed fixture trees double as the byte-preservation
// references — originals are read from tests/fixtures/prime/, outcomes from the
// scratch dir.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const RUN = process.env.PRIME_FIXTURE_DIR ?? "";
const ORIG = join(import.meta.dir, "fixtures/prime");
const gated = describe.skipIf(!RUN);

const out = (p: string) => readFileSync(join(RUN, p), "utf8");
const orig = (p: string) => readFileSync(join(ORIG, p), "utf8");
const START = "<!-- speculator:prime:start -->";
const END = "<!-- speculator:prime:end -->";
const count = (h: string, n: string) => h.split(n).length - 1;
const fence = (t: string) => t.slice(t.indexOf(START) + START.length, t.indexOf(END));

gated("AC1 — first prime: one fence, teaches, outside bytes preserved", () => {
  test("exactly one well-formed fence", () => {
    const t = out("fx-ts/CLAUDE.md");
    expect(count(t, START)).toBe(1);
    expect(count(t, END)).toBe(1);
    expect(t.indexOf(START)).toBeLessThan(t.indexOf(END));
  });
  test("bytes before the fence are the original file, unchanged", () => {
    const t = out("fx-ts/CLAUDE.md");
    expect(t.startsWith(orig("fx-ts/CLAUDE.md"))).toBe(true);
  });
  test("section teaches inline: commands, gate model, provenance stamp", () => {
    const s = fence(out("fx-ts/CLAUDE.md"));
    expect(s).toMatch(/primed by \/sdlc prime, plugin v\d+\.\d+\.\d+, \d{4}-\d{2}-\d{2}/);
    expect(s).toContain("/sdlc start");
    expect(s).toContain("/sdlc doctor");
    expect(s).toContain("Gate model");
    expect(s.split("\n").length).toBeLessThanOrEqual(62); // 60-line budget + fence padding
  });
});

gated("AC2 — re-prime is idempotent (same version + date)", () => {
  test("file after re-run is byte-identical to after run 1", () => {
    expect(out("fx-ts/CLAUDE.md")).toBe(out("fx-ts/CLAUDE.md.run1"));
  });
});

gated("AC3 — no CLAUDE.md: created, section-only", () => {
  test("created file is exactly one fenced section", () => {
    const t = out("fx-none/CLAUDE.md");
    expect(t.trimStart().startsWith(START)).toBe(true);
    expect(count(t, START)).toBe(1);
    expect(count(t, END)).toBe(1);
  });
});

gated("AC4 — malformed markers: hard stop, files byte-identical", () => {
  test("start-without-end untouched", () => {
    expect(out("fx-bad/CLAUDE.md")).toBe(orig("fx-bad/CLAUDE.md"));
  });
  test("end-before-start untouched", () => {
    expect(out("fx-bad2/CLAUDE.md")).toBe(orig("fx-bad2/CLAUDE.md"));
  });
});

gated("AC5 — tailoring matches the project", () => {
  test("TS project gets asbuilt enablement + backfill pointer + both cautions", () => {
    const s = fence(out("fx-ts/CLAUDE.md"));
    expect(s).toContain("mode: asbuilt");
    expect(s).toContain("comprehension-workflow.md");
    expect(s).toContain("skeleton.ts");
    expect(s).toContain("call edges");
  });
  test("unsupported-language project gets the supported-set note and no asbuilt how-to", () => {
    const s = fence(out("fx-nots/CLAUDE.md"));
    expect(s).toContain("currently supports TypeScript, Go, Java, and Python");
    expect(s).not.toContain("mode: asbuilt");
  });
  test("Go project gets the full asbuilt block (SPEC-053)", () => {
    const s = fence(out("fx-go/CLAUDE.md"));
    expect(s).toContain("mode: asbuilt");
    expect(s).toContain("comprehension-workflow.md");
  });
});

gated("AC6 — config truth-telling and doctor delegation", () => {
  test("existing config reflected: eval-intent named as enabled", () => {
    expect(fence(out("fx-ts/CLAUDE.md"))).toContain("eval-intent");
  });
  test("declined scaffolding leaves no config behind", () => {
    expect(existsSync(join(RUN, "fx-nots/.claude/sdlc.local.md"))).toBe(false);
  });
  test("accepted scaffolding produced doctor --init output, byte-identical", () => {
    const produced = out("fx-accept/.claude/sdlc.local.md");
    expect(produced.trim()).toBe(orig("doctor-init.reference.md").trim());
  });
});
