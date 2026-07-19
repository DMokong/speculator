import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { extractGraph } from "../src/extract";
import { fold } from "../src/fold";
import { saveManifest } from "../src/manifest";
import { generateBundle } from "../src/skeleton";
import { verifyBundle } from "../src/verify";

const FIXTURE = new URL("fixtures/fixture-repo", import.meta.url).pathname;
execSync(`bash ${join(FIXTURE, "seed.sh")}`);

const EVIDENCE_DIR = new URL("fixtures/evidence", import.meta.url).pathname;
function ev(name: string): string {
  return join(EVIDENCE_DIR, name);
}

// Computed once — generateBundle (called fresh per test below) is a pure,
// cheap function of this manifest.
const manifest = await extractGraph(FIXTURE);

// claw-nybt: the src/alpha.ts symbol cited by fixtures/evidence/pass-artifact.yml's
// sole comprehension_entries code_location ("src/alpha.ts#alphaMain") — used below
// as the id we simulate deleting from the committed manifest.
const DEAD_ID = "src/alpha.ts#alphaMain";

const tmpDirs: string[] = [];
function freshBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), "asbuilt-fold-"));
  tmpDirs.push(dir);
  generateBundle(dir, manifest);
  return dir;
}

function frontmatterOf(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match).not.toBeNull();
  return parse(match?.[1] ?? "");
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

describe("AC1: fold-in lands enriched zones and frontmatter updates", () => {
  test("fold pass-evidence enriches alpha.md and beta.md, writes log.md, and verifyBundle stays ok", () => {
    const dir = freshBundle();

    const result = fold({
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
    });

    expect([...result.folded].sort()).toEqual(["src/alpha.md", "src/beta.md"]);
    expect(result.skipped).toEqual([]);

    const alpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");
    expect(alpha).toContain("# Explanation\nAlpha module orchestrates gamma doubling.");
    expect(alpha).toContain("# Decisions\n- (SPEC-TEST) chose repeat(2) for determinism");
    expect(alpha).toContain("# Citations\n[1] SPEC-TEST evidence:");

    const fm = frontmatterOf(alpha);
    expect(fm.enrichment).toBe("fully-audited");
    expect(fm.from).toEqual(["SPEC-TEST"]);
    expect(fm.explains).toContain("src/alpha.ts#alphaMain");
    expect(fm.stale).toBe(false);
    expect(fm.stale_reason).toBe("");
    // Deliberate expectation change (SPEC-049 Task 4): skeleton.ts now
    // renders `tags` on every concept, and fold preserves them verbatim
    // (see concept.ts's resolveTags) — src/alpha.ts's tags are
    // [src, module, class, function, method] per the deterministic tags rule.
    expect(fm.tags).toEqual(["src", "module", "class", "function", "method"]);

    const log = readFileSync(join(dir, "docs/asbuilt/log.md"), "utf8");
    expect(log.startsWith("# Bundle Update Log\n")).toBe(true);
    expect(log).toContain("## 2026-07-04");
    expect(log).toContain("* **Fold**: SPEC-TEST enriched [src/alpha.ts](/src/alpha.md) (fully-audited).");
    expect(log).toContain("* **Fold**: SPEC-TEST enriched [src/beta.ts](/src/beta.md) (fully-audited).");

    const verifyResult = verifyBundle(join(dir, "docs/asbuilt"));
    expect(verifyResult.violations).toEqual([]);
    expect(verifyResult.ok).toBe(true);
  });

  test("bundle-dir-prefixed concept paths are normalized correctly", () => {
    const dir = freshBundle();
    // Create a test evidence file with prefixed concept paths
    const testEvidence = `
result: pass
mechanical:
  blocking: false
spec_id: SPEC-PREFIXED
generator:
  artifact: artifact-prefixed.yml
`;
    const evidencePath = join(dir, "evidence-prefixed.yml");
    writeFileSync(evidencePath, testEvidence);

    // Create artifact with prefixed concept paths
    const testArtifact = `
comprehension_entries: []
enrichment_drafts:
  - concept: docs/asbuilt/src/alpha.md
    explanation: "Alpha module orchestrates gamma doubling."
    decisions: "chose repeat(2) for determinism"
`;
    const artifactPath = join(dir, "artifact-prefixed.yml");
    writeFileSync(artifactPath, testArtifact);

    const result = fold({
      evidencePath,
      targetRepo: dir,
      specId: "SPEC-PREFIXED",
      provenance: "fully-audited",
      date: "2026-07-04",
    });

    // Should fold into the same file as if the path were "src/alpha.md"
    expect(result.folded).toContain("src/alpha.md");
    expect(result.folded).not.toContain("docs/asbuilt/src/alpha.md");

    const alpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");
    expect(alpha).toContain("# Explanation\nAlpha module orchestrates gamma doubling.");

    const log = readFileSync(join(dir, "docs/asbuilt/log.md"), "utf8");
    expect(log).toContain("* **Fold**: SPEC-PREFIXED enriched [src/alpha.ts](/src/alpha.md) (fully-audited).");
  });
});

describe("AC11 (SPEC-049 Task 4): legacy concept lacking tags is re-derived on write", () => {
  test("a concept with no `tags` key gets a degraded fallback ([firstSegment, \"module\"]) when folded without a committed graph manifest", () => {
    const dir = freshBundle(); // freshBundle() never saves .graph-manifest.json — fold has no manifest to consult
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const stripped = readFileSync(alphaPath, "utf8").replace(/\ntags:\n(?: {2}- .*\n)+/, "\n");
    expect(stripped).not.toContain("tags:");
    writeFileSync(alphaPath, stripped);

    fold({
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
    });

    const fm = frontmatterOf(readFileSync(alphaPath, "utf8"));
    expect(fm.tags).toEqual(["src", "module"]);
  });
});

describe("AC2: re-fold is byte-identical", () => {
  test("folding the same evidence twice produces identical bytes and reports skipped, not folded", () => {
    const dir = freshBundle();
    const opts = {
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited" as const,
      date: "2026-07-04",
    };

    fold(opts);
    const before = hashBundle(dir);

    const second = fold(opts);
    expect(second.folded).toEqual([]);
    expect([...second.skipped].sort()).toEqual(["src/alpha.md", "src/beta.md"]);

    expect(hashBundle(dir)).toBe(before);
  });
});

describe("AC3: refusals produce zero writes", () => {
  test("result: fail refuses without touching the bundle", () => {
    const dir = freshBundle();
    const before = hashBundle(dir);
    expect(() =>
      fold({
        evidencePath: ev("fail-evidence.yml"),
        targetRepo: dir,
        specId: "SPEC-TEST",
        provenance: "fully-audited",
        date: "2026-07-04",
      }),
    ).toThrow();
    expect(hashBundle(dir)).toBe(before);
  });

  test("mechanical.blocking: true refuses even though result: pass (contradiction case)", () => {
    const dir = freshBundle();
    const before = hashBundle(dir);
    expect(() =>
      fold({
        evidencePath: ev("blocking-evidence.yml"),
        targetRepo: dir,
        specId: "SPEC-TEST",
        provenance: "fully-audited",
        date: "2026-07-04",
      }),
    ).toThrow();
    expect(hashBundle(dir)).toBe(before);
  });

  test("mechanical.skipped: true refuses without --allow-unchecked, naming the reason", () => {
    const dir = freshBundle();
    const before = hashBundle(dir);
    expect(() =>
      fold({
        evidencePath: ev("skipped-evidence.yml"),
        targetRepo: dir,
        specId: "SPEC-TEST",
        provenance: "fully-audited",
        date: "2026-07-04",
      }),
    ).toThrow(/mechanical checks were skipped/);
    expect(hashBundle(dir)).toBe(before);
  });

  test("mechanical.skipped: true folds with --allow-unchecked", () => {
    const dir = freshBundle();
    const result = fold({
      evidencePath: ev("skipped-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
      allowUnchecked: true,
    });
    expect(result.folded).toEqual(["src/util/gamma.md"]);
    const gamma = readFileSync(join(dir, "docs/asbuilt/src/util/gamma.md"), "utf8");
    expect(gamma).toContain("# Explanation\nGamma is the low-level string-doubling primitive alpha depends on.");
  });
});

describe("AC7: provenance transitions", () => {
  test("accuracy-audited lands on a skeleton concept, upgrades to fully-audited, then refuses a downgrade", () => {
    const dir = freshBundle();

    fold({
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-A",
      provenance: "accuracy-audited",
      date: "2026-07-04",
    });
    let fm = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.enrichment).toBe("accuracy-audited");

    fold({
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-B",
      provenance: "fully-audited",
      date: "2026-07-04",
    });
    fm = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.enrichment).toBe("fully-audited");

    const beforeAlpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");
    expect(() =>
      fold({
        evidencePath: ev("pass-evidence.yml"),
        targetRepo: dir,
        specId: "SPEC-C",
        provenance: "accuracy-audited",
        date: "2026-07-04",
      }),
    ).toThrow(/downgrade/);
    expect(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8")).toBe(beforeAlpha);
  });
});

describe("Missing concept: validate-all-before-write-any", () => {
  test("a draft naming a nonexistent concept refuses before any write, leaving a co-drafted valid concept untouched", () => {
    const dir = freshBundle();

    fold({
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
    });
    const beforeAlpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");

    expect(() =>
      fold({
        evidencePath: ev("ghost-evidence.yml"),
        targetRepo: dir,
        specId: "SPEC-GHOST",
        provenance: "fully-audited",
        date: "2026-07-04",
      }),
    ).toThrow(/src\/ghost\.md/);

    expect(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8")).toBe(beforeAlpha);
  });
});

describe("Fenced-code-aware heading detection (T2 review fix)", () => {
  test("a fenced literal '# Explanation' inside a concept's machine zone does not split there — the full machine zone survives fold, and the real enriched zone lands after it", () => {
    const dir = freshBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const before = readFileSync(alphaPath, "utf8");

    // Inject a fenced code sample containing a literal "# Explanation" line
    // into the middle of the machine zone (between "# Structure" and
    // "## Exports") — before the fix, isHeadingLine/isAnyHeadingLine would
    // treat this as the real split point, silently discarding "## Exports"
    // onward (the rest of the mechanically-written machine zone).
    const fence = "```ts\n# Explanation\nfake heading — literal text inside a fenced example, not a real heading\n```\n\n";
    const mutated = before.replace("# Structure\n\n", `# Structure\n\n${fence}`);
    expect(mutated).not.toBe(before);
    writeFileSync(alphaPath, mutated);

    const result = fold({
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
    });
    expect(result.folded).toContain("src/alpha.md");

    const after = readFileSync(alphaPath, "utf8");

    // The fenced sample itself survived, still inside the machine zone.
    expect(after).toContain(fence.trimEnd());
    // Everything that used to come after the fake heading in the machine
    // zone is still present — nothing was discarded.
    expect(after).toContain("## Exports");
    expect(after).toContain("## Symbols");
    expect(after).toContain("## Calls out");
    expect(after).toContain("## Called by");
    // The real enriched zone (from the draft) is appended after all of it.
    expect(after).toContain("# Explanation\nAlpha module orchestrates gamma doubling.");

    const fenceIdx = after.indexOf(fence.trimEnd());
    const exportsIdx = after.indexOf("## Exports");
    const realExplanationIdx = after.indexOf("# Explanation\nAlpha module orchestrates gamma doubling.");
    expect(fenceIdx).toBeGreaterThan(-1);
    expect(exportsIdx).toBeGreaterThan(fenceIdx);
    expect(realExplanationIdx).toBeGreaterThan(exportsIdx);
  });

  test("a fenced literal '# Decisions\\n- (FAKE-SPEC) ...' quoted inside an Explanation never leaks a phantom bullet into the permanent Decisions accumulation", () => {
    const dir = freshBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");

    fold({
      evidencePath: ev("fenced-decisions-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
    });

    // The Explanation section legitimately still quotes the fenced example
    // verbatim (it's prose, not structural markup that fold interprets).
    const afterFirst = readFileSync(alphaPath, "utf8");
    expect(afterFirst).toContain("- (FAKE-SPEC) example");

    // A second fold (different spec) re-parses the on-disk Decisions section
    // to accumulate across specs. Before the fix, the fenced "# Decisions"
    // heading inside the Explanation prose was mistaken for a real section
    // boundary, and "- (FAKE-SPEC) example" leaked into the accumulated map
    // — becoming a permanent, re-persisted phantom decision from here on.
    fold({
      evidencePath: ev("fenced-decisions-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-OTHER",
      provenance: "fully-audited",
      date: "2026-07-04",
    });

    const afterSecond = readFileSync(alphaPath, "utf8");
    const decisionsSection = decisionsSectionOf(afterSecond);
    expect(decisionsSection).not.toContain("FAKE-SPEC");
    expect(decisionsSection).toContain("- (SPEC-TEST) chose repeat(2) for determinism");
    expect(decisionsSection).toContain("- (SPEC-OTHER) chose repeat(2) for determinism");
  });
});

/** Extracts the real (rendered) "# Decisions" section body — the one immediately preceding "# Citations" — from a folded concept file. */
function decisionsSectionOf(raw: string): string {
  const citationsIdx = raw.indexOf("\n\n# Citations\n");
  expect(citationsIdx).toBeGreaterThan(-1);
  const decisionsHeadingIdx = raw.lastIndexOf("\n# Decisions\n", citationsIdx);
  expect(decisionsHeadingIdx).toBeGreaterThan(-1);
  return raw.slice(decisionsHeadingIdx + "\n# Decisions\n".length, citationsIdx);
}

describe("Log orphan-heading fix", () => {
  test("re-folding identical inputs under a later --date leaves log.md byte-identical (no empty date heading)", () => {
    const dir = freshBundle();
    const baseOpts = {
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited" as const,
    };

    fold({ ...baseOpts, date: "2026-07-04" });
    const logAfterFirst = readFileSync(join(dir, "docs/asbuilt/log.md"), "utf8");
    expect(logAfterFirst).toContain("## 2026-07-04");

    fold({ ...baseOpts, date: "2026-07-05" });
    const logAfterSecond = readFileSync(join(dir, "docs/asbuilt/log.md"), "utf8");

    expect(logAfterSecond).toBe(logAfterFirst);
    expect(logAfterSecond).not.toContain("## 2026-07-05");
  });
});

describe("Unreadable evidence file produces a refusal, not a raw ENOENT", () => {
  test("fold CLI exits 1 with a friendly refusal message when --evidence names a nonexistent file", () => {
    const dir = freshBundle();
    const ASBUILT_ROOT = new URL("..", import.meta.url).pathname;
    const result = Bun.spawnSync(
      [
        "bun",
        "src/fold.ts",
        "--evidence",
        join(dir, "does-not-exist.yml"),
        "--target",
        dir,
        "--spec-id",
        "SPEC-TEST",
      ],
      { cwd: ASBUILT_ROOT },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString("utf8")).toContain("refusing to fold: cannot read");
    expect(result.stderr.toString("utf8")).not.toContain("ENOENT");
  });
});

describe("claw-nybt: explains dead-id reconciliation", () => {
  test("re-fold drops explains ids absent from the committed manifest", async () => {
    const dir = freshBundle();
    // manifest present on disk -> fold filters against it
    saveManifest(join(dir, "docs/asbuilt/.graph-manifest.json"), manifest);
    await fold({ evidencePath: ev("pass-evidence.yml"), targetRepo: dir, specId: "SPEC-T1", provenance: "fully-audited", date: "2026-07-06" });
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");

    // Review fix (claw-nybt re-audit): pass-artifact.yml cites only DEAD_ID,
    // so at this point explains == [DEAD_ID] and the "every OTHER
    // previously-present id survives" loop below would run zero iterations
    // — silently passing regardless of whether survival actually works.
    // Seed a second, manifest-present id that this fold's evidence does NOT
    // cite (src/alpha.ts#AlphaService, a real symbol from `manifest`)
    // directly into alpha.md's frontmatter so the loop has a real case to
    // check: a partial re-audit must not drop ids it simply didn't touch.
    const SURVIVOR_ID = "src/alpha.ts#AlphaService";
    const withSurvivor = readFileSync(alphaPath, "utf8").replace(
      "explains:\n  - src/alpha.ts#alphaMain\n",
      `explains:\n  - src/alpha.ts#alphaMain\n  - ${SURVIVOR_ID}\n`,
    );
    expect(withSurvivor).toContain(SURVIVOR_ID); // guard: the string surgery above actually matched
    writeFileSync(alphaPath, withSurvivor);

    const before = frontmatterOf(readFileSync(alphaPath, "utf8"));
    expect(before.explains).toContain(DEAD_ID); // DEAD_ID = the cited id you chose as B
    expect(before.explains).toContain(SURVIVOR_ID); // guard against the vacuity coming back

    // symbol B is deleted from the code: prune it from the committed manifest
    const pruned = { ...manifest, symbols: manifest.symbols.filter((s) => s.id !== DEAD_ID) };
    saveManifest(join(dir, "docs/asbuilt/.graph-manifest.json"), pruned);

    await fold({ evidencePath: ev("pass-evidence.yml"), targetRepo: dir, specId: "SPEC-T1", provenance: "fully-audited", date: "2026-07-06" });
    const after = frontmatterOf(readFileSync(alphaPath, "utf8"));
    expect(after.explains).not.toContain(DEAD_ID);
    // every OTHER previously-present id survives (partial-audit safety) —
    // now a real, non-vacuous check thanks to SURVIVOR_ID above.
    for (const id of (before.explains as string[]).filter((i) => i !== DEAD_ID)) {
      expect(after.explains).toContain(id);
    }
  });

  test("no manifest on disk -> merge behavior unchanged (dead id retained)", async () => {
    const dir = freshBundle(); // no .graph-manifest.json written
    await fold({ evidencePath: ev("pass-evidence.yml"), targetRepo: dir, specId: "SPEC-T1", provenance: "fully-audited", date: "2026-07-06" });
    const fm = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.explains).toContain(DEAD_ID); // preserved: nothing to validate against
  });
});

// ---------------------------------------------------------------------------
// SPEC-005: suggested_type application (task 01-fold-suggested-type).
//
// These tests use hand-authored evidence/artifact YAML written directly into
// a freshBundle() temp dir (same idiom as the "bundle-dir-prefixed concept
// paths" test above) rather than the checked-in fixtures/evidence/*.yml
// fixtures, which predate the `suggested_type` field. AC3 is the one
// exception: it deliberately reuses the existing pass-evidence.yml/
// pass-artifact.yml fixture pair (no suggested_type field) to prove absent-
// field backward compatibility.
// ---------------------------------------------------------------------------

/** Writes a minimal evidence.yml + artifact.yml pair into `dir` and returns the evidence path fold() should be given. `draftsYaml` is the raw YAML body under `enrichment_drafts:` (each `- concept: ...` entry, including any `suggested_type` line, fully formatted by the caller). */
function writeSuggestedTypeEvidence(dir: string, specId: string, draftsYaml: string): string {
  const artifactPath = join(dir, `artifact-${specId}.yml`);
  const evidencePath = join(dir, `evidence-${specId}.yml`);
  writeFileSync(artifactPath, `comprehension_entries: []\nenrichment_drafts:\n${draftsYaml}`);
  writeFileSync(
    evidencePath,
    ["result: pass", "mechanical:", "  blocking: false", `spec_id: ${specId}`, "generator:", `  artifact: artifact-${specId}.yml`, ""].join(
      "\n",
    ),
  );
  return evidencePath;
}

/** Top-level frontmatter key names, in the order they appear in `raw`'s frontmatter block (SPEC-049 field order check). */
function fieldOrderOf(raw: string): string[] {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match).not.toBeNull();
  const block = match?.[1] ?? "";
  return block
    .split("\n")
    .filter((l) => /^[a-zA-Z_]+:/.test(l))
    .map((l) => l.split(":")[0] ?? "");
}

const SPEC049_FIELD_ORDER = ["type", "title", "description", "resource", "tags", "enrichment", "from", "explains", "stale", "stale_reason", "graph_hash"];

describe("SPEC-005 AC1: fold applies suggested_type over the mechanical Module default", () => {
  test("test_ac1_fold_applies_suggested_type_and_preserves_field_order", () => {
    const dir = freshBundle();
    const evidencePath = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AC1",
      [
        "  - concept: src/alpha.md",
        '    explanation: "Alpha module orchestrates gamma doubling."',
        '    decisions: "chose repeat(2) for determinism"',
        '    suggested_type: "Service"',
        "",
      ].join("\n"),
    );

    const result = fold({
      evidencePath,
      targetRepo: dir,
      specId: "SPEC-005-AC1",
      provenance: "fully-audited",
      date: "2026-07-19",
    });

    const alpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");
    const fm = frontmatterOf(alpha);
    expect(fm.type).toBe("Service");
    expect(fieldOrderOf(alpha)).toEqual(SPEC049_FIELD_ORDER);

    expect(result.typeCounts?.applied).toBe(1);
    expect(result.typeCounts?.preserved).toBe(0);
  });
});

describe("SPEC-005 AC2: first-semantic-wins — an existing semantic type is preserved, not overwritten", () => {
  test("test_ac2_fold_preserves_existing_semantic_type_and_counts_preserved", () => {
    const dir = freshBundle();

    const ev1 = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AC2A",
      [
        "  - concept: src/alpha.md",
        '    explanation: "Alpha module orchestrates gamma doubling."',
        '    decisions: "first pass establishes a semantic type"',
        '    suggested_type: "Model"',
        "",
      ].join("\n"),
    );
    const r1 = fold({ evidencePath: ev1, targetRepo: dir, specId: "SPEC-005-AC2A", provenance: "fully-audited", date: "2026-07-19" });
    expect(frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8")).type).toBe("Model");
    expect(r1.typeCounts?.applied).toBe(1);

    // A later, different spec's draft carries a DIFFERENT suggested_type for the same concept.
    const ev2 = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AC2B",
      [
        "  - concept: src/alpha.md",
        '    explanation: "Alpha module orchestrates gamma doubling."',
        '    decisions: "second pass, later spec, different suggestion"',
        '    suggested_type: "Service"',
        "",
      ].join("\n"),
    );
    const r2 = fold({ evidencePath: ev2, targetRepo: dir, specId: "SPEC-005-AC2B", provenance: "fully-audited", date: "2026-07-19" });

    const fm = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.type).toBe("Model"); // first-semantic-wins: never overwritten to "Service"
    expect(r2.typeCounts?.preserved).toBe(1);
    expect(r2.typeCounts?.applied).toBe(0);
  });
});

describe("SPEC-005 AC3: absent suggested_type folds byte-identically to today's mechanical path", () => {
  test("test_ac3_fold_byte_identical_when_suggested_type_absent", () => {
    const dirA = freshBundle();
    const dirB = freshBundle();
    const baseOpts = {
      evidencePath: ev("pass-evidence.yml"), // pass-artifact.yml has no suggested_type field at all
      specId: "SPEC-TEST",
      provenance: "fully-audited" as const,
      date: "2026-07-04",
    };

    const resultA = fold({ ...baseOpts, targetRepo: dirA });
    const resultB = fold({ ...baseOpts, targetRepo: dirB });

    // The load-bearing proof: two independent runs of the real pipeline over
    // the same absent-field inputs land byte-identical bundles — the feature
    // introduces zero drift when the field is absent.
    expect(hashBundle(dirA)).toBe(hashBundle(dirB));

    const alphaFm = frontmatterOf(readFileSync(join(dirA, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(alphaFm.type).toBe("Module"); // mechanical default, undisturbed

    expect(resultA.typeCounts?.applied).toBe(0);
    expect(resultA.typeCounts?.preserved).toBe(0);
    expect(resultA.typeCounts?.skipped).toBe(0);
    expect(resultA.typeCounts?.skippedInvalid).toBe(0);
  });

  // Hardening (round 2, test-adversary survivor "v1-ac3-fold"): the AC3
  // absent-suggested_type path must stay on the MECHANICAL reclassifyType
  // path (which preserves any already-established semantic type), not the
  // filename-only conceptType() classifier. Every prior AC3/AC2 fixture only
  // ever re-folded a concept still at the mechanical Module default, so a
  // buggy implementation returning conceptType(resource) instead of
  // reclassifyType(existingType, resource) for the undefined-field branch
  // agreed with the correct one everywhere the old suite looked. This test
  // forces the divergence: fold once to ESTABLISH a semantic type via
  // suggested_type, then fold again with a draft whose suggested_type field
  // is genuinely absent (not "", not "Module" — the key itself is missing).
  test("test_ac3_second_fold_with_no_suggested_type_field_preserves_a_previously_applied_semantic_type", () => {
    const dir = freshBundle();

    const ev1 = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AC3B-1",
      [
        "  - concept: src/alpha.md",
        '    explanation: "Alpha module orchestrates gamma doubling."',
        '    decisions: "first pass establishes a semantic type"',
        '    suggested_type: "Service"',
        "",
      ].join("\n"),
    );
    fold({ evidencePath: ev1, targetRepo: dir, specId: "SPEC-005-AC3B-1", provenance: "fully-audited", date: "2026-07-19" });
    expect(frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8")).type).toBe("Service"); // guard: first fold applied

    // Second fold, a DIFFERENT spec, whose draft carries NO suggested_type
    // key at all — the genuine AC3 absent-field case.
    const ev2 = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AC3B-2",
      [
        "  - concept: src/alpha.md",
        '    explanation: "Alpha module orchestrates gamma doubling."',
        '    decisions: "second pass, later spec, no suggested_type field at all"',
        "",
      ].join("\n"),
    );
    const result = fold({ evidencePath: ev2, targetRepo: dir, specId: "SPEC-005-AC3B-2", provenance: "fully-audited", date: "2026-07-19" });

    const fm = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.type).toBe("Service"); // AC3: absent suggested_type must never disturb an established semantic type
    expect(result.typeCounts?.applied).toBe(0);
    expect(result.typeCounts?.preserved).toBe(0);
    expect(result.typeCounts?.skipped).toBe(0);
    expect(result.typeCounts?.skippedInvalid).toBe(0);
  });
});

describe("SPEC-005 AC4: a test-classified resource keeps Test and ignores any suggestion", () => {
  test("test_ac4_fold_test_classified_resource_keeps_test_and_ignores_suggestion", () => {
    const dir = freshBundle();
    const bundleDir = join(dir, "docs/asbuilt");
    const conceptRelPath = "src/foo.test.md";
    const conceptAbsPath = join(bundleDir, conceptRelPath);
    writeFileSync(
      conceptAbsPath,
      [
        "---",
        "type: Test",
        "title: src/foo.test.ts",
        "description: synthetic test-classified fixture for AC4",
        "resource: src/foo.test.ts",
        "tags:",
        "  - src",
        "  - module",
        "  - test",
        "enrichment: none",
        "from: []",
        "explains: []",
        "stale: false",
        'stale_reason: ""',
        'graph_hash: ""',
        "---",
        "",
        "# Structure",
        "",
        "no symbols.",
        "",
      ].join("\n"),
    );

    const evidencePath = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AC4",
      [
        `  - concept: ${conceptRelPath}`,
        '    explanation: "Covers the test-classified resource."',
        '    decisions: "n/a"',
        '    suggested_type: "Service"',
        "",
      ].join("\n"),
    );

    const result = fold({ evidencePath, targetRepo: dir, specId: "SPEC-005-AC4", provenance: "fully-audited", date: "2026-07-19" });

    const fm = frontmatterOf(readFileSync(conceptAbsPath, "utf8"));
    expect(fm.type).toBe("Test"); // machine-owned; a suggestion never overrides test classification
    expect(result.typeCounts?.skipped).toBe(1);
    expect(result.typeCounts?.applied).toBe(0);
  });

  // Hardening (round 2, test-adversary survivor "AC4 fold.ts variant"):
  // test-ownership must be derived from the resource's FILENAME pattern
  // (conceptType(resource)), never from whatever the concept's CURRENT
  // frontmatter `type` happens to read. The suite's only prior AC4 fixture
  // hand-wrote `type: Test` already in frontmatter before folding, so a
  // buggy implementation checking `existingType === "Test"` instead of
  // `conceptType(resource) === "Test"` produced an identical outcome there.
  // This fixture starts a test-pattern-filename concept at the mechanical
  // "Module" default (simulating a drifted/not-yet-classified bundle) to
  // force the two checks to diverge.
  test("test_ac4_fold_test_classified_resource_by_filename_stays_test_even_when_frontmatter_type_is_still_module", () => {
    const dir = freshBundle();
    const bundleDir = join(dir, "docs/asbuilt");
    const conceptRelPath = "src/bar.test.md";
    const conceptAbsPath = join(bundleDir, conceptRelPath);
    writeFileSync(
      conceptAbsPath,
      [
        "---",
        "type: Module",
        "title: src/bar.test.ts",
        "description: synthetic drifted test-classified fixture for AC4",
        "resource: src/bar.test.ts",
        "tags:",
        "  - src",
        "  - module",
        "  - test",
        "enrichment: none",
        "from: []",
        "explains: []",
        "stale: false",
        'stale_reason: ""',
        'graph_hash: ""',
        "---",
        "",
        "# Structure",
        "",
        "no symbols.",
        "",
      ].join("\n"),
    );

    const evidencePath = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AC4B",
      [
        `  - concept: ${conceptRelPath}`,
        '    explanation: "Covers the drifted test-classified resource."',
        '    decisions: "n/a"',
        '    suggested_type: "Service"',
        "",
      ].join("\n"),
    );

    const result = fold({ evidencePath, targetRepo: dir, specId: "SPEC-005-AC4B", provenance: "fully-audited", date: "2026-07-19" });

    const fm = frontmatterOf(readFileSync(conceptAbsPath, "utf8"));
    // The filename pattern (src/bar.test.ts) makes this Test-owned
    // regardless of the currently-drifted "Module" frontmatter — a
    // suggestion must never win here.
    expect(fm.type).toBe("Test");
    expect(result.typeCounts?.skipped).toBe(1);
    expect(result.typeCounts?.applied).toBe(0);
  });
});

describe("SPEC-005 AC9a: a literal Module/Test suggestion is a no-op, counted skipped", () => {
  test("test_ac9a_fold_literal_module_suggestion_is_noop_and_counted_skipped", () => {
    const dir = freshBundle();
    const evidencePath = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AC9A-M",
      [
        "  - concept: src/alpha.md",
        '    explanation: "Alpha module orchestrates gamma doubling."',
        '    decisions: "n/a"',
        '    suggested_type: "Module"',
        "",
      ].join("\n"),
    );

    const result = fold({ evidencePath, targetRepo: dir, specId: "SPEC-005-AC9A-M", provenance: "fully-audited", date: "2026-07-19" });

    const fm = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.type).toBe("Module");
    expect(result.typeCounts?.skipped).toBe(1);
    expect(result.typeCounts?.applied).toBe(0);
  });

  test("test_ac9a_fold_literal_test_suggestion_does_not_force_test_on_non_test_resource", () => {
    // The trap this AC guards against: a naive "field present -> apply it"
    // implementation would flip a non-test file's type to "Test". Treated as
    // absent, it must fall through to the MECHANICAL default for this
    // (non-test) resource — "Module" — not "Test".
    const dir = freshBundle();
    const evidencePath = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AC9A-T",
      [
        "  - concept: src/alpha.md",
        '    explanation: "Alpha module orchestrates gamma doubling."',
        '    decisions: "n/a"',
        '    suggested_type: "Test"',
        "",
      ].join("\n"),
    );

    const result = fold({ evidencePath, targetRepo: dir, specId: "SPEC-005-AC9A-T", provenance: "fully-audited", date: "2026-07-19" });

    const fm = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.type).toBe("Module");
    expect(result.typeCounts?.skipped).toBe(1);
  });
});

describe("SPEC-005 AC9 (fold half): malformed suggested_type values are treated as absent, never written, and never abort sibling drafts", () => {
  test("test_ac9_fold_malformed_suggestions_skipped_invalid_and_siblings_still_apply", () => {
    const dir = freshBundle();
    const evidencePath = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AC9F",
      [
        "  - concept: src/alpha.md",
        '    explanation: "Alpha module orchestrates gamma doubling."',
        '    decisions: "n/a"',
        '    suggested_type: ""',
        "  - concept: src/beta.md",
        '    explanation: "Beta module adapts raw input for alpha by trimming it first."',
        '    decisions: "n/a"',
        '    suggested_type: "ZZZMALFORMEDMULTILINEZZZ\\nEvil"',
        "  - concept: src/util/gamma.md",
        '    explanation: "Gamma is the low-level string-doubling primitive alpha depends on."',
        '    decisions: "n/a"',
        '    suggested_type: "Migration"',
        "",
      ].join("\n"),
    );

    let result: ReturnType<typeof fold> | undefined;
    expect(() => {
      result = fold({ evidencePath, targetRepo: dir, specId: "SPEC-005-AC9F", provenance: "fully-audited", date: "2026-07-19" });
    }).not.toThrow(); // one malformed draft field must not abort applying the others

    const alpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");
    const beta = readFileSync(join(dir, "docs/asbuilt/src/beta.md"), "utf8");
    const gamma = readFileSync(join(dir, "docs/asbuilt/src/util/gamma.md"), "utf8");

    expect(frontmatterOf(alpha).type).toBe("Module"); // empty string -> treated as absent
    expect(frontmatterOf(beta).type).toBe("Module"); // multi-line -> treated as absent
    expect(frontmatterOf(gamma).type).toBe("Migration"); // sibling with a well-formed novel type still applies (open vocabulary)

    // Malformed values must never reach a written file.
    expect(beta).not.toContain("ZZZMALFORMEDMULTILINEZZZ");
    expect(beta).not.toContain("Evil");

    expect(result?.typeCounts?.skippedInvalid).toBe(2);
    expect(result?.typeCounts?.applied).toBe(1);
  });

  test("test_ac9_fold_non_string_suggested_type_treated_as_absent_and_never_written", () => {
    const dir = freshBundle();
    const evidencePath = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AC9N",
      ["  - concept: src/alpha.md", '    explanation: "Alpha module orchestrates gamma doubling."', '    decisions: "n/a"', "    suggested_type: 424242", ""].join(
        "\n",
      ),
    );

    const result = fold({ evidencePath, targetRepo: dir, specId: "SPEC-005-AC9N", provenance: "fully-audited", date: "2026-07-19" });

    const alpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");
    expect(frontmatterOf(alpha).type).toBe("Module");
    expect(alpha).not.toContain("424242");
    expect(result.typeCounts?.skippedInvalid).toBe(1);
  });
});

// Cleanup after the whole suite has read everything it needs.
process.on("exit", () => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

// Final-audit hardening (2026-07-19, conductor round): the refute panel found
// fold and reclassify implementing DIFFERENT precedence orders for the same
// input classes. Precedence is now canonical across both paths: malformed ->
// literal Module/Test -> test-boundary -> existing-semantic -> apply. These
// tests mirror reclassify.test.ts's AC9a hardening into fold, and pin the
// amended AC4 boundary rule (suggestion never applied across the test
// boundary; a pre-existing semantic type on a test resource is preserved in
// value, never repaired to Test).
describe("SPEC-005 canonical precedence (final-audit findings): fold matches reclassify", () => {
  test("test_ac9a_fold_literal_module_on_already_semantic_concept_is_skipped_not_preserved", () => {
    const dir = freshBundle();

    const ev1 = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AUD1",
      [
        "  - concept: src/alpha.md",
        '    explanation: "Alpha module orchestrates gamma doubling."',
        '    decisions: "first pass establishes a semantic type"',
        '    suggested_type: "Model"',
        "",
      ].join("\n"),
    );
    fold({ evidencePath: ev1, targetRepo: dir, specId: "SPEC-005-AUD1", provenance: "fully-audited", date: "2026-07-19" });

    const ev2 = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AUD2",
      [
        "  - concept: src/alpha.md",
        '    explanation: "Alpha module orchestrates gamma doubling."',
        '    decisions: "agent echoes machine vocabulary back"',
        '    suggested_type: "Module"',
        "",
      ].join("\n"),
    );
    const r2 = fold({ evidencePath: ev2, targetRepo: dir, specId: "SPEC-005-AUD2", provenance: "fully-audited", date: "2026-07-19" });

    const fm = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.type).toBe("Model"); // value untouched either way
    // AC9a is UNCONDITIONAL: literal machine vocabulary buckets as skipped in
    // both paths — never preserved (that was fold's divergence from
    // reclassify, refuted 3/3 by the final-audit panel).
    expect(r2.typeCounts?.skipped).toBe(1);
    expect(r2.typeCounts?.preserved).toBe(0);
    expect(r2.typeCounts?.applied).toBe(0);
  });

  test("test_ac4_fold_suggestion_never_applied_across_test_boundary_even_with_semantic_frontmatter", () => {
    const dir = freshBundle();
    const bundleDir = join(dir, "docs/asbuilt");
    const conceptRelPath = "src/foo.test.md";
    const conceptAbsPath = join(bundleDir, conceptRelPath);
    // A test-classified RESOURCE whose frontmatter already carries a semantic
    // type — reachable only via human edit (automated paths never assign
    // across the boundary). The human's value is preserved, never repaired to
    // Test, and the suggestion must not land.
    writeFileSync(
      conceptAbsPath,
      [
        "---",
        "type: Service",
        "title: src/foo.test.ts",
        "description: synthetic semantic-typed test-resource fixture (AC4 amended)",
        "resource: src/foo.test.ts",
        "tags:",
        "  - src",
        "  - module",
        "  - test",
        "enrichment: none",
        "from: []",
        "explains: []",
        "stale: false",
        'stale_reason: ""',
        'graph_hash: ""',
        "---",
        "",
        "# Structure",
        "",
        "no symbols.",
        "",
      ].join("\n"),
    );

    const evidencePath = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-AUD3",
      [
        `  - concept: ${conceptRelPath}`,
        '    explanation: "Covers the semantic-typed test resource."',
        '    decisions: "n/a"',
        '    suggested_type: "Model"',
        "",
      ].join("\n"),
    );
    const result = fold({ evidencePath, targetRepo: dir, specId: "SPEC-005-AUD3", provenance: "fully-audited", date: "2026-07-19" });

    const fm = frontmatterOf(readFileSync(conceptAbsPath, "utf8"));
    expect(fm.type).toBe("Service"); // preserved in value — no repair to Test, no application of Model
    expect(result.typeCounts?.skipped).toBe(1); // boundary reason outranks first-semantic-wins in the buckets
    expect(result.typeCounts?.preserved).toBe(0);
    expect(result.typeCounts?.applied).toBe(0);
  });
});

// Gate 2c cold-read finding (2026-07-19): fold's malformed check was
// exact-empty ("") while reclassify trims — a whitespace-only suggested_type
// would have been applied VERBATIM into frontmatter by fold. The check now
// trims in both paths; this pins it.
describe("SPEC-005 AC9 (fold): whitespace-only suggested_type is malformed, not applied", () => {
  test("test_ac9_fold_whitespace_only_suggestion_is_skipped_invalid", () => {
    const dir = freshBundle();
    const evidencePath = writeSuggestedTypeEvidence(
      dir,
      "SPEC-005-WS",
      [
        "  - concept: src/alpha.md",
        '    explanation: "Alpha module orchestrates gamma doubling."',
        '    decisions: "n/a"',
        '    suggested_type: "   "',
        "",
      ].join("\n"),
    );
    const result = fold({ evidencePath, targetRepo: dir, specId: "SPEC-005-WS", provenance: "fully-audited", date: "2026-07-19" });

    const fm = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.type).toBe("Module"); // mechanical path; whitespace never written
    expect(result.typeCounts?.skippedInvalid).toBe(1);
    expect(result.typeCounts?.applied).toBe(0);
  });
});
