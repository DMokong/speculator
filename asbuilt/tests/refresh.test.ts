import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { extractGraph } from "../src/extract";
import { fold } from "../src/fold";
import { type GraphManifest, loadManifest, manifestHash, saveManifest } from "../src/manifest";
import { refresh } from "../src/refresh";
import { generateBundle } from "../src/skeleton";

const FIXTURE = new URL("fixtures/fixture-repo", import.meta.url).pathname;
execSync(`bash ${join(FIXTURE, "seed.sh")}`);

const EVIDENCE_DIR = new URL("fixtures/evidence", import.meta.url).pathname;
function ev(name: string): string {
  return join(EVIDENCE_DIR, name);
}

const tmpDirs: string[] = [];

/** mkdtemp copy of the seeded fixture repo (including its .git), fully isolated from other tests and from FIXTURE itself. */
function freshRepoCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "asbuilt-refresh-"));
  cpSync(FIXTURE, dir, { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

function gitCommit(dir: string, message: string, extraArgs: string[] = []): void {
  execSync(`git -C ${dir} -c user.email=fixture@local -c user.name=fixture commit -q ${extraArgs.join(" ")} -m "${message}"`);
}

/** Builds the initial (pre-mutation) bundle + committed manifest, exactly as extract+skeleton would. */
async function buildInitialBundle(dir: string): Promise<GraphManifest> {
  const manifest = await extractGraph(dir);
  generateBundle(dir, manifest);
  saveManifest(join(dir, "docs/asbuilt/.graph-manifest.json"), manifest);
  return manifest;
}

function frontmatterOf(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match).not.toBeNull();
  return parse(match?.[1] ?? "");
}

/** Everything from the first "# Explanation" heading to the end of the file — the whole enriched zone. */
function enrichedZoneOf(raw: string): string {
  const idx = raw.indexOf("# Explanation");
  expect(idx).toBeGreaterThan(-1);
  return raw.slice(idx);
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
    hash.update(" ");
    hash.update(readFileSync(join(bundleDir, f)));
    hash.update(" ");
  }
  return hash.digest("hex");
}

describe("AC4: explains-drift flags an enriched concept stale when its cited symbol changes", () => {
  test("alpha.md goes stale when helper's body changes; Structure reflects live spans; Explanation is byte-identical; log.md gets a Refresh bullet", async () => {
    const dir = freshRepoCopy();
    await buildInitialBundle(dir);

    // Hand-fold a synthetic enriched zone onto alpha.md, citing src/alpha.ts#helper specifically (not alphaMain).
    fold({
      evidencePath: ev("refresh-helper-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
    });

    const alphaPathMd = join(dir, "docs/asbuilt/src/alpha.md");
    const beforeRaw = readFileSync(alphaPathMd, "utf8");
    const beforeFm = frontmatterOf(beforeRaw);
    expect(beforeFm.enrichment).toBe("fully-audited");
    expect(beforeFm.explains).toEqual(["src/alpha.ts#helper"]);
    expect(beforeFm.stale).toBe(false);
    const beforeEnriched = enrichedZoneOf(beforeRaw);

    // Mutate helper's body in the temp repo copy, then commit there.
    const alphaTsPath = join(dir, "src/alpha.ts");
    writeFileSync(alphaTsPath, readFileSync(alphaTsPath, "utf8").replace("x * 2", "x * 9"));
    gitCommit(dir, "mutate helper", ["-a"]);

    const result = await refresh({ targetRepo: dir, date: "2026-07-04" });

    expect(result.created).toEqual([]);
    expect(result.stale).toEqual(["src/alpha.md"]);
    expect(result.removed_sources).toEqual([]);
    // Neither symbol span nor any rendered edge changes from a same-line body edit — the
    // rendered machine zone is untouched even though the underlying content_hash differs.
    expect(result.regenerated).toEqual([]);

    const afterRaw = readFileSync(alphaPathMd, "utf8");
    const afterFm = frontmatterOf(afterRaw);
    expect(afterFm.stale).toBe(true);
    expect(String(afterFm.stale_reason)).toContain("src/alpha.ts#helper");
    // Preserved verbatim across the refresh.
    expect(afterFm.enrichment).toBe("fully-audited");
    expect(afterFm.explains).toEqual(["src/alpha.ts#helper"]);
    // Deliberate expectation change (SPEC-049 Task 4): skeleton.ts now
    // renders `tags` on every concept, and refresh PRESERVES them verbatim
    // (concept.ts's resolveTags) rather than re-deriving — same tag set
    // before and after this refresh.
    expect(afterFm.tags).toEqual(beforeFm.tags);
    expect(afterFm.tags).toEqual(["src", "module", "class", "function", "method"]);

    // Structure still matches the live (freshly re-extracted) span for helper.
    expect(afterRaw).toContain("`helper` | function | 13-15 | no |");

    // The enriched zone (Explanation/Decisions/Citations) is untouched, byte-for-byte.
    expect(enrichedZoneOf(afterRaw)).toBe(beforeEnriched);

    // graph_hash bumped to the new (post-mutation) manifest's hash.
    const newManifest = loadManifest(join(dir, "docs/asbuilt/.graph-manifest.json"));
    expect(afterFm.graph_hash).toBe(manifestHash(newManifest));

    const log = readFileSync(join(dir, "docs/asbuilt/log.md"), "utf8");
    expect(log).toContain("**Refresh**: 0 regenerated, 0 new, 1 stale.");
  });
});

describe("AC11 (SPEC-049 Task 4): legacy concept lacking tags is re-derived from the manifest on refresh", () => {
  test("stripping `tags` from alpha.md, then forcing a refresh, re-derives the full kind-inclusive tag set", async () => {
    const dir = freshRepoCopy();
    await buildInitialBundle(dir); // saves .graph-manifest.json, so refresh has a manifest to derive kinds from

    const alphaPathMd = join(dir, "docs/asbuilt/src/alpha.md");
    const stripped = readFileSync(alphaPathMd, "utf8").replace(/\ntags:\n(?: {2}- .*\n)+/, "\n");
    expect(stripped).not.toContain("tags:");
    writeFileSync(alphaPathMd, stripped);

    // Force refresh to actually touch alpha.md's frontmatter: mutate helper's
    // body (same trigger as the AC4 test above) so the manifest hash changes
    // and alpha.md (a commonFiles member) gets its frontmatter re-rendered.
    const alphaTsPath = join(dir, "src/alpha.ts");
    writeFileSync(alphaTsPath, readFileSync(alphaTsPath, "utf8").replace("x * 2", "x * 9"));
    gitCommit(dir, "mutate helper", ["-a"]);

    await refresh({ targetRepo: dir, date: "2026-07-04" });

    const fm = frontmatterOf(readFileSync(alphaPathMd, "utf8"));
    expect(fm.tags).toEqual(["src", "module", "class", "function", "method"]);
  });
});

describe("AC5: a new source file and a deleted one update the bundle and manifest", () => {
  test("adding delta.ts creates a skeleton; deleting gamma.ts flags it source-removed; alpha.md's Calls-out collaterally regenerates", async () => {
    const dir = freshRepoCopy();
    await buildInitialBundle(dir);

    const beforeAlpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");
    expect(beforeAlpha).toContain("[gamma](/src/util/gamma.md)");
    const beforeGamma = readFileSync(join(dir, "docs/asbuilt/src/util/gamma.md"), "utf8");

    writeFileSync(join(dir, "src/delta.ts"), "export function delta(): number {\n  return 4;\n}\n");
    execSync(`git -C ${dir} add src/delta.ts`);
    execSync(`git -C ${dir} rm -q src/util/gamma.ts`);
    gitCommit(dir, "add delta, remove gamma");

    const result = await refresh({ targetRepo: dir, date: "2026-07-04" });

    expect(result.created).toEqual(["src/delta.md"]);
    expect(result.removed_sources).toEqual(["src/util/gamma.md"]);
    expect(result.regenerated).toEqual(["src/alpha.md"]);
    expect(result.stale).toEqual([]);

    const newManifest = loadManifest(join(dir, "docs/asbuilt/.graph-manifest.json"));
    const newHash = manifestHash(newManifest);
    expect(newManifest.symbols.some((s) => s.id === "src/delta.ts#delta")).toBe(true);
    expect(newManifest.symbols.some((s) => s.file === "src/util/gamma.ts")).toBe(false);

    const delta = readFileSync(join(dir, "docs/asbuilt/src/delta.md"), "utf8");
    expect(delta).toContain("`delta` (function, lines 1-3)");
    const deltaFm = frontmatterOf(delta);
    expect(deltaFm.resource).toBe("src/delta.ts");
    expect(deltaFm.stale).toBe(false);
    expect(deltaFm.graph_hash).toBe(newHash);

    const gamma = readFileSync(join(dir, "docs/asbuilt/src/util/gamma.md"), "utf8");
    const gammaFm = frontmatterOf(gamma);
    expect(gammaFm.stale).toBe(true);
    expect(gammaFm.stale_reason).toBe("source removed");
    expect(gammaFm.graph_hash).toBe(newHash);
    // Machine zone (and everything past frontmatter) is left byte-untouched.
    expect(gamma.slice(gamma.indexOf("\n---\n", 3) + 5)).toBe(beforeGamma.slice(beforeGamma.indexOf("\n---\n", 3) + 5));

    const alpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");
    expect(alpha).not.toContain("[gamma](/src/util/gamma.md)");
    expect(frontmatterOf(alpha).graph_hash).toBe(newHash);

    const log = readFileSync(join(dir, "docs/asbuilt/log.md"), "utf8");
    expect(log).toContain("**Refresh**: 1 regenerated, 1 new, 0 stale.");
  });

  test("a second refresh with no further changes is a byte-identical no-op (no new log.md entry)", async () => {
    const dir = freshRepoCopy();
    await buildInitialBundle(dir);
    writeFileSync(join(dir, "src/delta.ts"), "export function delta(): number {\n  return 4;\n}\n");
    execSync(`git -C ${dir} add src/delta.ts`);
    execSync(`git -C ${dir} rm -q src/util/gamma.ts`);
    gitCommit(dir, "add delta, remove gamma");

    await refresh({ targetRepo: dir, date: "2026-07-04" });
    const before = hashBundle(dir);
    const logBefore = readFileSync(join(dir, "docs/asbuilt/log.md"), "utf8");

    const second = await refresh({ targetRepo: dir, date: "2026-07-05" });

    expect(second).toEqual({ created: [], regenerated: [], stale: [], removed_sources: [] });
    expect(hashBundle(dir)).toBe(before);
    expect(readFileSync(join(dir, "docs/asbuilt/log.md"), "utf8")).toBe(logBefore);
  });
});

describe("Missing committed manifest refuses with a clear message", () => {
  test("refresh throws instead of silently extracting when docs/asbuilt/.graph-manifest.json has never been saved", async () => {
    const dir = freshRepoCopy();
    const manifest = await extractGraph(dir);
    generateBundle(dir, manifest); // note: no saveManifest — no committed manifest on disk yet
    await expect(refresh({ targetRepo: dir, date: "2026-07-04" })).rejects.toThrow(/No graph manifest found/);
  });
});

// SPEC-049 T7 dogfood find: before the conceptPath fix, src/index.ts's
// concept path ("src/index.md") collided with the reserved per-directory
// index.md — a refresh touching index.ts would have rewritten whichever of
// the two "src/index.md" writes happened to run last, silently conflating a
// Module concept with a directory listing. This synthetic repo (never the
// shared FIXTURE/goldens above) exercises refresh specifically on a
// reserved-name source file.
describe("SPEC-049 T7 dogfood: refresh on a reserved-name concept (src/index.ts.md)", () => {
  function makeSyntheticRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "asbuilt-refresh-reserved-"));
    tmpDirs.push(dir);
    mkdirSync(join(dir, "src/util"), { recursive: true });
    writeFileSync(join(dir, "src/index.ts"), "export function indexMain(): number {\n  return 1;\n}\n");
    writeFileSync(join(dir, "src/util/log.ts"), 'export function logIt(): string {\n  return "hi";\n}\n');
    writeFileSync(join(dir, "src/normal.ts"), "export function normal(): number {\n  return 2;\n}\n");
    execSync(`git init -q ${dir}`);
    execSync(`git -C ${dir} add -A`);
    gitCommit(dir, "seed");
    return dir;
  }

  test("modifying index.ts regenerates src/index.ts.md's machine zone; the directory index src/index.md is never itself treated as 'regenerated' and keeps listing all three concepts", async () => {
    const dir = makeSyntheticRepo();
    await buildInitialBundle(dir);

    const beforeIndexConcept = readFileSync(join(dir, "docs/asbuilt/src/index.ts.md"), "utf8");
    const beforeDirIndex = readFileSync(join(dir, "docs/asbuilt/src/index.md"), "utf8");

    // Widen indexMain's span by one line (1-3 -> 1-4) — a change the rendered
    // "## Symbols" table, and therefore the machine zone, actually reflects
    // (a same-line body edit alone would not, per the AC4 test above).
    writeFileSync(
      join(dir, "src/index.ts"),
      "export function indexMain(): number {\n  const x = 1;\n  return x;\n}\n",
    );
    gitCommit(dir, "widen indexMain", ["-a"]);

    const result = await refresh({ targetRepo: dir, date: "2026-07-04" });

    expect(result.created).toEqual([]);
    expect(result.removed_sources).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.regenerated).toEqual(["src/index.ts.md"]);
    // The directory index is a distinct reserved file, never itself
    // regenerated as a concept — the fix keeps the two paths from ever
    // being confused, in either direction.
    expect(result.regenerated).not.toContain("src/index.md");

    const afterIndexConcept = readFileSync(join(dir, "docs/asbuilt/src/index.ts.md"), "utf8");
    expect(afterIndexConcept).not.toBe(beforeIndexConcept);
    expect(afterIndexConcept).toContain("`indexMain` | function | 1-4 | yes |");
    expect(frontmatterOf(afterIndexConcept).resource).toBe("src/index.ts");

    // The directory index's own concept listing is untouched content-wise
    // (indexMain's symbol count didn't change, only its span) — writeIndexes
    // rewrites it unconditionally whenever the manifest changes at all, but
    // it still correctly lists all three concepts at their collision-safe
    // paths and was never clobbered by (or mistaken for) the concept file.
    const afterDirIndex = readFileSync(join(dir, "docs/asbuilt/src/index.md"), "utf8");
    expect(afterDirIndex).toBe(beforeDirIndex);
    expect(afterDirIndex).toContain("(index.ts.md)");
    expect(afterDirIndex).toContain("(normal.md)");
    expect(afterDirIndex.startsWith("---")).toBe(false);
  });
});

// claw-nybt: the src/alpha.ts symbol cited by fixtures/evidence/refresh-helper-evidence.yml's
// sole comprehension_entries code_location — the function we delete below to
// exercise the live slack-bot journey end to end (delete dead code, re-audit,
// converge back to clean).
const HELPER_ID = "src/alpha.ts#helper";

/**
 * Removes exactly the `helper` function refresh-helper-evidence.yml cites,
 * leaving the rest of alpha.ts (including AlphaService.run's now-dangling
 * `helper(x)` call) untouched — extract.ts parses structurally via
 * tree-sitter and never type-checks, so a dangling reference doesn't break
 * extraction.
 */
function stripHelperFunction(src: string): string {
  const stripped = src.replace(/\n\nfunction helper\(x: number\): number \{\n {2}return x \* 2;\n\}\n$/, "\n");
  if (stripped === src) {
    throw new Error("stripHelperFunction: helper block not found in src/alpha.ts — fixture drifted");
  }
  return stripped;
}

describe("claw-nybt/AC1: deletion + re-audit converges to clean", () => {
  test("dead id drops from explains and refresh reports the concept clean", async () => {
    const dir = freshRepoCopy();
    await buildInitialBundle(dir);
    fold({
      evidencePath: ev("refresh-helper-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-T2",
      provenance: "fully-audited",
      date: "2026-07-06",
    });

    // delete the cited helper function from src/alpha.ts entirely, commit
    const src = join(dir, "src/alpha.ts");
    writeFileSync(src, stripHelperFunction(readFileSync(src, "utf8")));
    gitCommit(dir, "delete helper", ["-a"]);

    // refresh #1: concept goes stale naming the dead id — correct: prose cites deleted code
    const r1 = await refresh({ targetRepo: dir, date: "2026-07-06" });
    expect(r1.stale).toContain("src/alpha.md");
    const mid = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(String(mid.stale_reason)).toContain(HELPER_ID);

    // re-audit: fold fresh evidence citing only a symbol of src/alpha.ts that
    // still exists (alphaMain — untouched by the deletion above), modeled on
    // refresh-helper-evidence.yml / refresh-helper-artifact.yml but written
    // to a tmp path.
    const tmpArtifactPath = join(dir, "tmp-live-artifact.yml");
    const tmpEvidenceCitingLiveSymbol = join(dir, "tmp-live-evidence.yml");
    writeFileSync(
      tmpArtifactPath,
      [
        "comprehension_entries:",
        "  - ac_id: AC1",
        '    ac_text: "Alpha module doubles input via gamma and uppercases it."',
        '    implementation_summary: "src/alpha.ts#alphaMain calls gamma(input) then uppercases the result."',
        "    code_locations:",
        '      - symbol: "src/alpha.ts#alphaMain"',
        '        lines: "3-5"',
        "    coverage: full",
        '    gap_notes: ""',
        "",
        "enrichment_drafts:",
        "  - concept: src/alpha.md",
        '    explanation: "Alpha module orchestrates gamma doubling; the private helper indirection was removed."',
        '    decisions: "re-audited after helper deletion; alphaMain is the only symbol still cited"',
        "",
      ].join("\n"),
    );
    writeFileSync(
      tmpEvidenceCitingLiveSymbol,
      [
        "gate: comprehension-asbuilt",
        "mode: shadow",
        "result: pass",
        "spec_id: SPEC-T2B",
        "mechanical:",
        "  blocking: false",
        "generator:",
        "  artifact: tmp-live-artifact.yml",
        "",
      ].join("\n"),
    );
    fold({
      evidencePath: tmpEvidenceCitingLiveSymbol,
      targetRepo: dir,
      specId: "SPEC-T2B",
      provenance: "fully-audited",
      date: "2026-07-06",
    });
    const post = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(post.explains).not.toContain(HELPER_ID); // Task 1's filter, against the refreshed manifest

    // refresh #2: the alarm clears
    const r2 = await refresh({ targetRepo: dir, date: "2026-07-06" });
    expect(r2.stale).not.toContain("src/alpha.md");
    const fin = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fin.stale).toBe(false);
    expect(String(fin.stale_reason ?? "")).not.toContain(HELPER_ID);

    // Isolating refresh.ts's own merge fix (claw-nybt, refresh.ts:216): fold
    // ALWAYS resets stale_reason to "" on every write it makes — the same
    // write that drops a dead id from explains also wipes stale_reason — so
    // refresh #2 above converges cleanly regardless of whether the
    // parseChangedIds filter is applied; it never sees a non-empty
    // stale_reason to (mis)carry forward. To pin the actual merge behavior,
    // hand-poison alpha.md's on-disk stale_reason back to "changed: <dead
    // id>" (simulating a reason string a refresh had recorded earlier and
    // no fold has cleared since), then force a SEPARATE, legitimate drift
    // (alphaMain's own body changes) so `merged` is non-empty — and a fresh
    // stale_reason gets written — regardless of the fix; this isolates
    // whether the dead helper id rides along with that legitimate rewrite.
    const alphaMdPath = join(dir, "docs/asbuilt/src/alpha.md");
    const cleanAlphaMd = readFileSync(alphaMdPath, "utf8");
    const poisonedAlphaMd = cleanAlphaMd.replace('stale_reason: ""', `stale_reason: "changed: ${HELPER_ID}"`);
    expect(poisonedAlphaMd).not.toBe(cleanAlphaMd);
    writeFileSync(alphaMdPath, poisonedAlphaMd);

    const alphaTsPath = join(dir, "src/alpha.ts");
    writeFileSync(alphaTsPath, readFileSync(alphaTsPath, "utf8").replace("toUpperCase()", 'toUpperCase() + ""'));
    gitCommit(dir, "touch alphaMain", ["-a"]);

    const r3 = await refresh({ targetRepo: dir, date: "2026-07-06" });
    expect(r3.stale).toContain("src/alpha.md"); // alphaMain's own drift legitimately flags it
    const fin3 = frontmatterOf(readFileSync(alphaMdPath, "utf8"));
    expect(fin3.stale).toBe(true);
    expect(String(fin3.stale_reason)).toContain("src/alpha.ts#alphaMain");
    expect(String(fin3.stale_reason)).not.toContain(HELPER_ID); // the dead helper id must not ride along
  });
});

describe("CLI", () => {
  test("exits 1 with usage when --target is missing", () => {
    const ASBUILT_ROOT = new URL("..", import.meta.url).pathname;
    const result = Bun.spawnSync(["bun", "src/refresh.ts"], { cwd: ASBUILT_ROOT });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString("utf8")).toContain("bun asbuilt/src/refresh.ts");
  });

  test("exits 0 and prints regenerated/new/stale/removed counts on a real no-op run", async () => {
    const dir = freshRepoCopy();
    await buildInitialBundle(dir);
    const ASBUILT_ROOT = new URL("..", import.meta.url).pathname;
    const result = Bun.spawnSync(["bun", "src/refresh.ts", "--target", dir, "--date", "2026-07-04"], {
      cwd: ASBUILT_ROOT,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString("utf8").trim()).toBe("regenerated=0 new=0 stale=0 removed=0");
  });
});

// Cleanup after the whole suite has read everything it needs.
process.on("exit", () => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

describe("SPEC-055: refresh clears exhausted changed: flags (claw-dkxq)", () => {
  /** Enrich alpha.md via fold, poison its stale fields to the given values,
   * then touch an unrelated file so the manifest hash moves (defeating the
   * no-op short-circuit) — the setup every test in this block shares. */
  async function poisonedBundle(staleReason: string): Promise<string> {
    const dir = freshRepoCopy();
    await buildInitialBundle(dir);
    fold({
      evidencePath: ev("refresh-helper-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-T55",
      provenance: "fully-audited",
      date: "2026-07-07",
    });
    const p = join(dir, "docs/asbuilt/src/alpha.md");
    const poisoned = readFileSync(p, "utf8")
      .replace("stale: false", "stale: true")
      .replace('stale_reason: ""', `stale_reason: "${staleReason}"`);
    expect(poisoned).toContain(`stale_reason: "${staleReason}"`); // surgery guard
    writeFileSync(p, poisoned);
    // move the manifest hash without drifting any of alpha.md's cited symbols
    const beta = join(dir, "src/beta.ts");
    writeFileSync(beta, `${readFileSync(beta, "utf8")}\nexport const spec055 = 55;\n`);
    gitCommit(dir, "unrelated change", ["-a"]);
    return dir;
  }

  test("test_ac1: a changed:-shaped flag with no surviving drift clears on refresh", async () => {
    // the recorded id is dead (absent from the manifest) and explains has no
    // drift -> zero surviving drift. NB a changed-id still PRESENT in the
    // manifest is carried until re-audit by design (sticky staleness) — the
    // clear applies only to exhausted flags like this one.
    const dir = await poisonedBundle("changed: src/alpha.ts#deletedGhost");
    const p = join(dir, "docs/asbuilt/src/alpha.md");
    const proseBefore = enrichedZoneOf(readFileSync(p, "utf8"));
    const r = await refresh({ targetRepo: dir, date: "2026-07-07" });
    const after = readFileSync(p, "utf8");
    const fm = frontmatterOf(after);
    expect(fm.stale).toBe(false);
    expect(fm.stale_reason ?? "").toBe("");
    expect(enrichedZoneOf(after)).toBe(proseBefore); // audited prose byte-identical
    expect(r.stale).not.toContain("src/alpha.md");
  });

  test("test_ac1b: mixed populations — dead ids drop, a still-present id keeps the flag", async () => {
    // one dead id + one live (carried-by-design) id: the flag must SURVIVE,
    // rewritten to name only the surviving id — the clear never fires while
    // any recorded id is still present in the manifest.
    const dir = await poisonedBundle("changed: src/alpha.ts#alphaMain, src/alpha.ts#deletedGhost");
    const p = join(dir, "docs/asbuilt/src/alpha.md");
    const r = await refresh({ targetRepo: dir, date: "2026-07-07" });
    const fm = frontmatterOf(readFileSync(p, "utf8"));
    expect(fm.stale).toBe(true);
    expect(fm.stale_reason).toBe("changed: src/alpha.ts#alphaMain");
    expect(r.stale).toContain("src/alpha.md");
  });

  test("test_ac2: a source-removed reason passes through untouched", async () => {
    const dir = await poisonedBundle("source removed");
    const p = join(dir, "docs/asbuilt/src/alpha.md");
    await refresh({ targetRepo: dir, date: "2026-07-07" });
    const fm = frontmatterOf(readFileSync(p, "utf8"));
    expect(fm.stale).toBe(true);
    expect(fm.stale_reason).toBe("source removed");
  });
});
