// Behavioral tests for the reclassify.ts mechanical backfill applier
// (SPEC-005 / docs/specs/asbuilt-semantic-types/spec.md AC6, AC7, AC9, AC9a,
// AC10). reclassify.ts does not exist yet at test-authoring time — these
// tests define its observable contract:
//
//   reclassify({ targetRepo, artifactPath }): { applied, preserved, skipped }
//   CLI: bun asbuilt/src/reclassify.ts --target <repo> --artifact <path>
//
// Fixtures reuse fold.test.ts's fixture-repo + evidence idioms: freshBundle()
// builds a virgin skeleton bundle from the shared manifest, enrichedBundle()
// additionally folds src/alpha.md and src/beta.md via pass-evidence.yml (that
// draft carries no suggested_type, so both stay type: Module post-fold —
// exactly the "enriched + Module-typed" precondition AC6 targets).
// src/util/gamma.md is deliberately left skeleton-only (enrichment: none) as
// the AC7 skeleton-only-skip fixture.

import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { extractGraph } from "../src/extract";
import { fold } from "../src/fold";
import { CLI_USAGE, reclassify } from "../src/reclassify";
import { generateBundle } from "../src/skeleton";

const FIXTURE = new URL("fixtures/fixture-repo", import.meta.url).pathname;
execSync(`bash ${join(FIXTURE, "seed.sh")}`);

const EVIDENCE_DIR = new URL("fixtures/evidence", import.meta.url).pathname;
function ev(name: string): string {
  return join(EVIDENCE_DIR, name);
}

// Computed once — generateBundle/fold (called fresh per test below) are pure,
// cheap functions of this manifest.
const manifest = await extractGraph(FIXTURE);

const ASBUILT_ROOT = new URL("..", import.meta.url).pathname;

const tmpDirs: string[] = [];
function freshBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), "asbuilt-reclassify-"));
  tmpDirs.push(dir);
  generateBundle(dir, manifest);
  return dir;
}

/** freshBundle() + fold src/alpha.md and src/beta.md via pass-evidence.yml (enrichment != none; type stays Module — the draft carries no suggested_type). src/util/gamma.md and src/noexport.md remain skeleton-only. */
function enrichedBundle(): string {
  const dir = freshBundle();
  fold({
    evidencePath: ev("pass-evidence.yml"),
    targetRepo: dir,
    specId: "SPEC-TEST",
    provenance: "fully-audited",
    date: "2026-07-04",
  });
  return dir;
}

function writeArtifact(dir: string, yamlText: string): string {
  const p = join(dir, "reclassify-artifact.yml");
  writeFileSync(p, yamlText);
  return p;
}

/** Shape of a `preserved`/`skipped` entry — reclassify.ts doesn't exist yet at
 * test-authoring time, so this local type keeps the below `.map()` callbacks
 * from resolving to implicit `any` while the module is unresolved. */
interface ReclassifySkipLike {
  concept: string;
  reason: string;
}

function frontmatterOf(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match).not.toBeNull();
  return parse(match?.[1] ?? "");
}

/** Everything after the closing frontmatter delimiter — the concept's whole body (machine zone + any enriched zone), for byte-equality assertions (required content #4: frontmatter-only writes). */
function bodyOf(raw: string): string {
  const match = raw.match(/^---\n[\s\S]*?\n---\n/);
  expect(match).not.toBeNull();
  return raw.slice((match?.[0] ?? "").length);
}

function walk(dir: string, base: string = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

/** Deterministic hash of every file's path + content under <dir>/docs/asbuilt. */
function hashBundle(dir: string): string {
  const bundleDir = join(dir, "docs/asbuilt");
  const hash = createHash("sha256");
  for (const f of walk(bundleDir).sort()) {
    hash.update(f);
    hash.update("\0");
    hash.update(readFileSync(join(bundleDir, f)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

describe("AC6: application + counts", () => {
  test("test_ac6_applies_suggested_type_to_enriched_module_concept_and_reports_applied", () => {
    const dir = enrichedBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const before = readFileSync(alphaPath, "utf8");
    expect(frontmatterOf(before).type).toBe("Module"); // guard: starts Module

    const artifactPath = writeArtifact(
      dir,
      "reclassifications:\n  - concept: src/alpha.md\n    suggested_type: Service\n",
    );
    const result = reclassify({ targetRepo: dir, artifactPath });

    expect(result.applied).toEqual(["src/alpha.md"]);
    expect(result.preserved).toEqual([]);
    expect(result.skipped).toEqual([]);

    const after = readFileSync(alphaPath, "utf8");
    expect(frontmatterOf(after).type).toBe("Service");
    expect(bodyOf(after)).toBe(bodyOf(before)); // body bytes unchanged
  });

  test("test_ac6_frontmatter_diff_is_exactly_the_type_line", () => {
    const dir = enrichedBundle();
    const betaPath = join(dir, "docs/asbuilt/src/beta.md");
    const before = readFileSync(betaPath, "utf8");

    const artifactPath = writeArtifact(
      dir,
      "reclassifications:\n  - concept: src/beta.md\n    suggested_type: Handler\n",
    );
    reclassify({ targetRepo: dir, artifactPath });

    const after = readFileSync(betaPath, "utf8");
    const beforeLines = before.split("\n");
    const afterLines = after.split("\n");
    expect(afterLines.length).toBe(beforeLines.length); // no lines added/removed
    const diffLines = beforeLines
      .map((line, i): [string, string | undefined] => [line, afterLines[i]])
      .filter(([b, a]) => b !== a);
    expect(diffLines).toEqual([["type: Module", "type: Handler"]]);
  });

  test("test_ac6_counts_reflect_applied_preserved_and_skipped_buckets", () => {
    const dir = enrichedBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const gammaPath = join(dir, "docs/asbuilt/src/util/gamma.md");

    // Manually promote alpha.md to an existing semantic type — simulates a
    // concept a prior reclassify/human edit already typed.
    const mutated = readFileSync(alphaPath, "utf8").replace("type: Module", "type: Model");
    expect(mutated).toContain("type: Model"); // surgery guard
    writeFileSync(alphaPath, mutated);

    const artifactPath = writeArtifact(
      dir,
      [
        "reclassifications:",
        "  - concept: src/alpha.md",
        "    suggested_type: Repository",
        "  - concept: src/beta.md",
        "    suggested_type: Handler",
        "  - concept: src/util/gamma.md",
        "    suggested_type: CLI",
        "",
      ].join("\n"),
    );

    const result = reclassify({ targetRepo: dir, artifactPath });

    expect(result.applied).toEqual(["src/beta.md"]);
    expect(result.preserved.map((s: ReclassifySkipLike) => s.concept)).toEqual(["src/alpha.md"]);
    expect(result.skipped.map((s: ReclassifySkipLike) => s.concept)).toEqual(["src/util/gamma.md"]);

    expect(frontmatterOf(readFileSync(alphaPath, "utf8")).type).toBe("Model"); // preserved, not Repository
    expect(frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/beta.md"), "utf8")).type).toBe("Handler");
    expect(frontmatterOf(readFileSync(gammaPath, "utf8")).type).toBe("Module"); // skeleton-only, untouched
  });

  test("test_ac6_cli_prints_applied_preserved_skipped_counts_and_exits_0", () => {
    const dir = enrichedBundle();
    const artifactPath = writeArtifact(
      dir,
      "reclassifications:\n  - concept: src/beta.md\n    suggested_type: Handler\n",
    );
    const result = Bun.spawnSync(["bun", "src/reclassify.ts", "--target", dir, "--artifact", artifactPath], {
      cwd: ASBUILT_ROOT,
    });
    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.toString("utf8");
    expect(stdout).toContain("applied=1");
    expect(stdout).toContain("preserved=0");
    expect(stdout).toContain("skipped=0");

    expect(frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/beta.md"), "utf8")).type).toBe("Handler");
  });

  test("test_ac6_cli_exits_0_even_when_every_entry_is_skipped_or_preserved", () => {
    const dir = enrichedBundle();
    const artifactPath = writeArtifact(
      dir,
      "reclassifications:\n  - concept: src/util/gamma.md\n    suggested_type: CLI\n",
    );
    const result = Bun.spawnSync(["bun", "src/reclassify.ts", "--target", dir, "--artifact", artifactPath], {
      cwd: ASBUILT_ROOT,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString("utf8")).toContain("skipped=1");
  });

  test("test_ac6_cli_usage_documents_target_and_artifact_flags", () => {
    expect(CLI_USAGE).toContain("reclassify.ts");
    expect(CLI_USAGE).toContain("--target");
    expect(CLI_USAGE).toContain("--artifact");
  });
});

describe("AC7: skip-with-reason + all-or-nothing validation", () => {
  test("test_ac7_skeleton_only_concept_is_skipped_with_a_reason_and_left_untouched", () => {
    const dir = enrichedBundle(); // gamma.md was never folded — enrichment: none
    const gammaPath = join(dir, "docs/asbuilt/src/util/gamma.md");
    const before = readFileSync(gammaPath, "utf8");

    const artifactPath = writeArtifact(
      dir,
      "reclassifications:\n  - concept: src/util/gamma.md\n    suggested_type: CLI\n",
    );
    const result = reclassify({ targetRepo: dir, artifactPath });

    expect(result.applied).toEqual([]);
    expect(result.preserved).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.concept).toBe("src/util/gamma.md");
    expect(typeof result.skipped[0]?.reason).toBe("string");
    expect(result.skipped[0]?.reason.length).toBeGreaterThan(0);

    expect(readFileSync(gammaPath, "utf8")).toBe(before); // byte-untouched
  });

  test("test_ac7_existing_semantic_type_is_preserved_not_overwritten", () => {
    const dir = enrichedBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const mutated = readFileSync(alphaPath, "utf8").replace("type: Module", "type: Model");
    expect(mutated).toContain("type: Model");
    writeFileSync(alphaPath, mutated);
    const before = readFileSync(alphaPath, "utf8");

    const artifactPath = writeArtifact(
      dir,
      "reclassifications:\n  - concept: src/alpha.md\n    suggested_type: Repository\n",
    );
    const result = reclassify({ targetRepo: dir, artifactPath });

    expect(result.applied).toEqual([]);
    expect(result.preserved).toHaveLength(1);
    expect(result.preserved[0]?.concept).toBe("src/alpha.md");
    expect(result.preserved[0]?.reason.length).toBeGreaterThan(0);

    const after = readFileSync(alphaPath, "utf8");
    expect(after).toBe(before); // genuinely untouched, not just type-equal
    expect(frontmatterOf(after).type).toBe("Model");
  });

  test("test_ac7_unknown_concept_path_throws_before_any_write", () => {
    const dir = enrichedBundle();
    const betaPath = join(dir, "docs/asbuilt/src/beta.md");
    const before = readFileSync(betaPath, "utf8");

    const artifactPath = writeArtifact(
      dir,
      [
        "reclassifications:",
        "  - concept: src/beta.md",
        "    suggested_type: Handler",
        "  - concept: src/ghost.md",
        "    suggested_type: Handler",
        "",
      ].join("\n"),
    );

    expect(() => reclassify({ targetRepo: dir, artifactPath })).toThrow(/src\/ghost\.md/);
    // The co-listed VALID entry must not have been written either —
    // all-or-nothing validation runs before any write.
    expect(readFileSync(betaPath, "utf8")).toBe(before);
  });

  test("test_ac7_cli_exits_nonzero_on_unknown_concept_and_writes_nothing", () => {
    const dir = enrichedBundle();
    const before = hashBundle(dir);
    const artifactPath = writeArtifact(
      dir,
      [
        "reclassifications:",
        "  - concept: src/beta.md",
        "    suggested_type: Handler",
        "  - concept: src/ghost.md",
        "    suggested_type: Handler",
        "",
      ].join("\n"),
    );
    const result = Bun.spawnSync(["bun", "src/reclassify.ts", "--target", dir, "--artifact", artifactPath], {
      cwd: ASBUILT_ROOT,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString("utf8")).toContain("src/ghost.md");
    expect(hashBundle(dir)).toBe(before); // zero writes
  });
});

describe("AC9: open vocabulary accepted as-is; malformed values rejected", () => {
  test("test_ac9_open_vocabulary_type_outside_curated_list_is_applied_as_is", () => {
    const dir = enrichedBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const artifactPath = writeArtifact(
      dir,
      "reclassifications:\n  - concept: src/alpha.md\n    suggested_type: Migration\n",
    );
    const result = reclassify({ targetRepo: dir, artifactPath });
    expect(result.applied).toEqual(["src/alpha.md"]);
    expect(frontmatterOf(readFileSync(alphaPath, "utf8")).type).toBe("Migration"); // no enum rejection
  });

  test("test_ac9_malformed_empty_string_suggested_type_is_rejected_before_any_write", () => {
    const dir = enrichedBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const before = readFileSync(alphaPath, "utf8");
    const artifactPath = writeArtifact(dir, 'reclassifications:\n  - concept: src/alpha.md\n    suggested_type: ""\n');
    expect(() => reclassify({ targetRepo: dir, artifactPath })).toThrow();
    expect(readFileSync(alphaPath, "utf8")).toBe(before);
  });

  test("test_ac9_malformed_multiline_suggested_type_is_rejected_before_any_write", () => {
    const dir = enrichedBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const before = readFileSync(alphaPath, "utf8");
    const artifactPath = writeArtifact(
      dir,
      "reclassifications:\n  - concept: src/alpha.md\n    suggested_type: |\n      Service\n      Extra\n",
    );
    expect(() => reclassify({ targetRepo: dir, artifactPath })).toThrow();
    expect(readFileSync(alphaPath, "utf8")).toBe(before);
  });

  test("test_ac9_malformed_nonstring_suggested_type_is_rejected_before_any_write", () => {
    const dir = enrichedBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const before = readFileSync(alphaPath, "utf8");
    const artifactPath = writeArtifact(dir, "reclassifications:\n  - concept: src/alpha.md\n    suggested_type: 42\n");
    expect(() => reclassify({ targetRepo: dir, artifactPath })).toThrow();
    expect(readFileSync(alphaPath, "utf8")).toBe(before);
  });

  test("test_ac9_validation_collects_multiple_violations_together_not_fail_fast", () => {
    const dir = enrichedBundle();
    const artifactPath = writeArtifact(
      dir,
      [
        "reclassifications:",
        "  - concept: src/ghost.md",
        "    suggested_type: Handler",
        "  - concept: src/alpha.md",
        '    suggested_type: ""',
        "",
      ].join("\n"),
    );
    let caught: unknown;
    try {
      reclassify({ targetRepo: dir, artifactPath });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    // Both violations must be named — a fail-fast-on-first-violation
    // implementation would surface only one of these two paths.
    expect(message).toContain("src/ghost.md");
    expect(message).toContain("src/alpha.md");
  });
});

describe("AC9a: literal Module/Test suggestion treated as absent (no-op, not an error)", () => {
  test("test_ac9a_literal_module_suggestion_is_skipped_not_applied", () => {
    const dir = enrichedBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const before = readFileSync(alphaPath, "utf8");
    const artifactPath = writeArtifact(
      dir,
      "reclassifications:\n  - concept: src/alpha.md\n    suggested_type: Module\n",
    );
    const result = reclassify({ targetRepo: dir, artifactPath });

    expect(result.applied).toEqual([]);
    expect(result.preserved).toEqual([]);
    expect(result.skipped.map((s: ReclassifySkipLike) => s.concept)).toEqual(["src/alpha.md"]);
    expect(readFileSync(alphaPath, "utf8")).toBe(before);
  });

  test("test_ac9a_literal_test_suggestion_is_skipped_not_applied", () => {
    const dir = enrichedBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const before = readFileSync(alphaPath, "utf8");
    const artifactPath = writeArtifact(dir, "reclassifications:\n  - concept: src/alpha.md\n    suggested_type: Test\n");
    const result = reclassify({ targetRepo: dir, artifactPath });

    expect(result.applied).toEqual([]);
    expect(result.preserved).toEqual([]);
    expect(result.skipped.map((s: ReclassifySkipLike) => s.concept)).toEqual(["src/alpha.md"]);
    expect(readFileSync(alphaPath, "utf8")).toBe(before); // never became literal "Test" — machine-owned
  });

  test("test_ac9a_literal_module_value_is_well_formed_not_a_validation_violation", () => {
    // Distinguishes AC9a (accepted at validation, no-op at apply) from AC9's
    // malformed-value rejection (aborts the whole run): pairing a
    // well-formed "Module" literal with a genuinely malformed sibling entry
    // must fail on the malformed one only — "Module" must never appear in
    // the violation message.
    const dir = enrichedBundle();
    const artifactPath = writeArtifact(
      dir,
      [
        "reclassifications:",
        "  - concept: src/alpha.md",
        "    suggested_type: Module",
        "  - concept: src/beta.md",
        '    suggested_type: ""',
        "",
      ].join("\n"),
    );
    let caught: unknown;
    try {
      reclassify({ targetRepo: dir, artifactPath });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("src/beta.md");
    expect(message).not.toContain("src/alpha.md");
  });

  // Hardening (round 2, test-adversary survivor "v3-ac9a-reclassify"): AC9a
  // is unconditional ("treated exactly as if the field were absent ...
  // counted as skipped"), regardless of the concept's CURRENT type. Every
  // prior AC9a fixture used src/alpha.md at its untouched Module default, so
  // an apply-phase check-order swap that moves the current-type branches
  // (Test-owned / already-semantic-preserved) ahead of the literal-Module/
  // Test no-op check was invisible — Module falls through identically either
  // way. Promoting the concept to an existing semantic type FIRST (the same
  // poisoning idiom AC6/AC7's own tests use) forces the divergence: the
  // no-op check must win and land this in `skipped`, never in `preserved`
  // (a different bucket/reason meant for genuine well-formed suggestions
  // losing to first-semantic-wins).
  test("test_ac9a_literal_module_suggestion_on_an_already_semantic_concept_is_skipped_not_preserved", () => {
    const dir = enrichedBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const mutated = readFileSync(alphaPath, "utf8").replace("type: Module", "type: Model");
    expect(mutated).toContain("type: Model"); // surgery guard
    writeFileSync(alphaPath, mutated);
    const before = readFileSync(alphaPath, "utf8");

    const artifactPath = writeArtifact(dir, "reclassifications:\n  - concept: src/alpha.md\n    suggested_type: Module\n");
    const result = reclassify({ targetRepo: dir, artifactPath });

    expect(result.applied).toEqual([]);
    expect(result.preserved).toEqual([]); // must NOT be bucketed as preserved
    expect(result.skipped.map((s: ReclassifySkipLike) => s.concept)).toEqual(["src/alpha.md"]);
    expect(result.skipped[0]?.reason).toContain("machine vocabulary");

    expect(readFileSync(alphaPath, "utf8")).toBe(before); // byte-untouched either way
    expect(frontmatterOf(readFileSync(alphaPath, "utf8")).type).toBe("Model");
  });

  test("test_ac9a_literal_test_suggestion_on_an_already_semantic_concept_is_skipped_not_preserved", () => {
    const dir = enrichedBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const mutated = readFileSync(alphaPath, "utf8").replace("type: Module", "type: Model");
    expect(mutated).toContain("type: Model"); // surgery guard
    writeFileSync(alphaPath, mutated);
    const before = readFileSync(alphaPath, "utf8");

    const artifactPath = writeArtifact(dir, "reclassifications:\n  - concept: src/alpha.md\n    suggested_type: Test\n");
    const result = reclassify({ targetRepo: dir, artifactPath });

    expect(result.applied).toEqual([]);
    expect(result.preserved).toEqual([]); // must NOT be bucketed as preserved
    expect(result.skipped.map((s: ReclassifySkipLike) => s.concept)).toEqual(["src/alpha.md"]);
    expect(result.skipped[0]?.reason).toContain("machine vocabulary");

    expect(readFileSync(alphaPath, "utf8")).toBe(before); // byte-untouched either way
    expect(frontmatterOf(readFileSync(alphaPath, "utf8")).type).toBe("Model");
  });
});

describe("AC10: byte-determinism + idempotence", () => {
  test("test_ac10_second_run_over_already_applied_state_reports_zero_applied_and_bundle_is_byte_identical", () => {
    const dir = enrichedBundle();
    const artifactPath = writeArtifact(
      dir,
      [
        "reclassifications:",
        "  - concept: src/alpha.md",
        "    suggested_type: Service",
        "  - concept: src/beta.md",
        "    suggested_type: Handler",
        "",
      ].join("\n"),
    );

    const first = reclassify({ targetRepo: dir, artifactPath });
    expect([...first.applied].sort()).toEqual(["src/alpha.md", "src/beta.md"]); // guard: first run did real work

    const afterFirst = hashBundle(dir);
    const second = reclassify({ targetRepo: dir, artifactPath });
    expect(second.applied).toEqual([]);
    expect(hashBundle(dir)).toBe(afterFirst);
  });

  test("test_ac10_final_bundle_bytes_are_independent_of_the_artifact_entries_order", () => {
    const dirA = enrichedBundle();
    const dirB = enrichedBundle();
    expect(hashBundle(dirA)).toBe(hashBundle(dirB)); // guard: identical starting state

    const artifactA = writeArtifact(
      dirA,
      [
        "reclassifications:",
        "  - concept: src/alpha.md",
        "    suggested_type: Service",
        "  - concept: src/beta.md",
        "    suggested_type: Handler",
        "",
      ].join("\n"),
    );
    const artifactB = writeArtifact(
      dirB,
      [
        "reclassifications:",
        "  - concept: src/beta.md",
        "    suggested_type: Handler",
        "  - concept: src/alpha.md",
        "    suggested_type: Service",
        "",
      ].join("\n"),
    );

    const resultA = reclassify({ targetRepo: dirA, artifactPath: artifactA });
    const resultB = reclassify({ targetRepo: dirB, artifactPath: artifactB });
    expect([...resultA.applied].sort()).toEqual(["src/alpha.md", "src/beta.md"]);
    expect([...resultB.applied].sort()).toEqual(["src/alpha.md", "src/beta.md"]);

    expect(hashBundle(dirA)).toBe(hashBundle(dirB));
  });
});

// Cleanup after the whole suite has read everything it needs.
process.on("exit", () => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});
