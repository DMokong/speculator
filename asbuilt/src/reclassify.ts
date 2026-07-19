// Mechanical backfill applier for the As-Built Knowledge System (SPEC-005
// R3, AC6, AC7, AC9, AC9a, AC10) — the mechanical backfill path for semantic
// frontmatter `type` on already-enriched concepts. (Not literally the ONLY
// writer that can touch `type` on an enriched concept: refresh.ts's
// machine-zone rewrite re-derives `type` mechanically via `reclassifyType`
// — it just never applies a SEMANTIC value. The hash-equality early-return
// that keeps unchanged concepts from being revisited lives in refresh.ts,
// claw-nb9j.) Companion to fold.ts's `suggested_type` forward path (SPEC-005
// R2): this file backfills the SAME field, mechanically, from a pre-computed
// artifact instead of a live LLM judgment — the mechanical/judgment boundary
// this whole spec turns on (docs/specs/asbuilt-semantic-types/spec.md
// "Intent & Anti-Patterns").
//
// Artifact format (YAML):
//
//   reclassifications:
//     - concept: <bundle-relative concept path, e.g. "src/alpha.md">
//       suggested_type: <string — the LLM's judged architectural role>
//     - concept: ...
//       suggested_type: ...
//
// `concept` matches the SAME bundle-relative path fold.ts's drafts use (see
// fold.ts's `normalizedConcept`): relative to <targetRepo>/docs/asbuilt/,
// optionally prefixed with "docs/asbuilt/" (stripped once, mirroring fold's
// normalization so reclassify accepts the same path shapes fold's drafts
// do). `suggested_type` is a single-line, non-empty string; open vocabulary
// (AC9) — any well-formed value outside the curated core vocabulary is
// accepted and applied as-is, no enum check.
//
// Two-phase run (PR #3 review C1 restructure — phase 1 does EVERYTHING that
// can fail, phase 2 only writes):
//
//   1. VALIDATE + STAGE (whole artifact, before any write): the artifact
//      must be a YAML mapping owning a `reclassifications` array (a typo'd
//      or missing wrapper key is a loud error, never a green zero-work run —
//      review C3). Every entry's `suggested_type` must be a non-empty,
//      single-line string; every entry's `concept` must resolve to a real
//      concept file INSIDE the target bundle (a `../` path that escapes
//      docs/asbuilt/ is a violation, not a write target — review C2); and
//      every referenced concept file must READ and PARSE (a malformed
//      concept is a phase-1 violation collected with the rest — it can
//      never abort mid-write, review C1). Entries that will be applied have
//      their rewritten content staged in memory here. ANY violation
//      anywhere aborts the ENTIRE run (all-or-nothing) with a nonzero exit
//      and zero writes — every violation is collected and reported
//      together, not just the first.
//   2. WRITE (only reached if phase 1 found zero violations): a pure loop
//      over the staged rewrites — no reads, no parsing, nothing left that
//      can throw between the first write and the last. Entries were staged
//      in codepoint-sorted concept-path order (determinism; no clock reads,
//      no randomness — AC10).
//
// Per-entry classification during phase 1, in precedence order (the
// literal → boundary → ownership → first-semantic-wins core is SHARED with
// fold.ts via concept.ts's decideSemanticType — claw-jeh5):
//   - concept is not verifiably enriched (frontmatter `enrichment` absent,
//     "none", or any unrecognized value — fail toward skip) -> skipped.
//   - `suggested_type` is literally "Module"/"Test" -> skipped (AC9a).
//   - concept's `resource` is missing/non-string -> skipped (test boundary
//     indeterminate; this used to fall through to apply — PR #3 review).
//   - `resource` classifies as Test (filename pattern) -> skipped (AC4).
//   - current `type` is machine-owned "Test" -> skipped. DISCLOSED
//     divergence: fold applies over a drifted Test-typed non-test resource;
//     reclassify defers to machine ownership.
//   - current `type` is semantic (not Module/Test/absent/null) -> preserved
//     (first-semantic-wins).
//   - otherwise (enriched, machine-typed: Module, absent, or null — the
//     absent/null case aligned with fold's reclassifyType by review C4) ->
//     applied: exactly the frontmatter `type` line is rewritten; every
//     other byte of the file is left untouched.
//
// Idempotent by construction (AC10): a concept whose type reclassify already
// wrote no longer reads as machine-typed on a later run, so it falls into
// the "already semantic" (preserved) branch instead of being rewritten
// again — no need to special-case "already-applied" separately.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { argValue } from "./cli";
import { decideSemanticType, parseFrontmatter, splitConcept } from "./concept";

export interface ReclassifyOptions {
  targetRepo: string;
  artifactPath: string;
}

export interface ReclassifySkip {
  concept: string;
  reason: string;
}

export interface ReclassifyResult {
  applied: string[]; // concept paths whose frontmatter `type` was rewritten
  preserved: ReclassifySkip[]; // concept paths that already carried a semantic type (first-semantic-wins)
  skipped: ReclassifySkip[]; // skeleton-only concepts, AC9a Module/Test literals, and Test-classified concepts
}

interface RawEntry {
  concept?: unknown;
  suggested_type?: unknown;
}

interface ArtifactShape {
  reclassifications?: RawEntry[];
}

/** Strips a single leading "docs/asbuilt/" prefix — mirrors fold.ts's concept-path normalization. */
function normalizeConceptPath(concept: string): string {
  return concept.startsWith("docs/asbuilt/") ? concept.slice("docs/asbuilt/".length) : concept;
}

/**
 * Reads `path` as utf8, translating any failure (missing file, permission
 * error, etc.) into the reclassify refusal convention instead of letting a
 * raw ENOENT/EACCES bubble up — mirrors fold.ts's `readFileOrThrow`.
 */
function readFileOrThrow(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`refusing to reclassify: cannot read ${path}`);
  }
}

/**
 * Rewrites exactly the `type:` line of a concept's raw frontmatter block to
 * `newType`, leaving every other line byte-untouched — the surgical (not
 * full-reconstruction) approach required content #4 demands ("differs from
 * before by exactly the type line"). `stringify({ type: newType })`
 * delegates quoting/escaping to the same yaml library the block was
 * originally rendered with (concept.ts's `renderFrontmatter`), so the
 * rewritten line stays consistent with that formatting.
 */
function rewriteTypeLine(frontmatterBlock: string, newType: string): string {
  const lines = frontmatterBlock.split("\n");
  const rendered = stringify({ type: newType }).replace(/\n$/, "");
  const idx = lines.findIndex((line, i) => i > 0 && line.startsWith("type:"));
  if (idx === -1) {
    // Absent-type concepts are machine-typed and DO receive the suggestion
    // (PR #3 review C4 — aligned with fold's reclassifyType). With no line
    // to rewrite, insert one at `type`'s canonical SPEC-049 position: first
    // field, immediately after the opening `---`.
    return [lines[0], rendered, ...lines.slice(1)].join("\n");
  }
  lines[idx] = rendered;
  return lines.join("\n");
}

/**
 * A concept file's full content, its raw frontmatter block, its parsed
 * frontmatter object, and the exact RAW bytes of everything past the
 * frontmatter (mirrors refresh.ts's `readFrontmatterAndRawBody` — no
 * machine/enriched re-split, so the body can never be reformatted by this
 * applier).
 */
function readConcept(
  conceptAbsPath: string,
  conceptLabel: string,
): { content: string; frontmatterBlock: string; frontmatter: Record<string, unknown>; rawBody: string } {
  const content = readFileSync(conceptAbsPath, "utf8");
  let split: ReturnType<typeof splitConcept>;
  try {
    split = splitConcept(content);
  } catch (err) {
    throw new Error(`refusing to reclassify: ${err instanceof Error ? err.message : String(err)}: ${conceptLabel}`);
  }
  const frontmatter = parseFrontmatter(split.frontmatterBlock);
  return { content, frontmatterBlock: split.frontmatterBlock, frontmatter, rawBody: content.slice(split.frontmatterBlock.length) };
}

/**
 * Applies a reclassification artifact to `opts.targetRepo`'s OKF bundle. See
 * this file's header comment for the exact two-phase contract. Throws
 * (before any write) when validation finds any violation anywhere in the
 * artifact — the thrown Error's message names every violating concept, not
 * just the first (AC9's "one malformed entry must not silently swallow
 * sibling violations" — unlike fold's single-throw-on-first-violation
 * convention, reclassify's all-or-nothing validation pass is exhaustive).
 */
export function reclassify(opts: ReclassifyOptions): ReclassifyResult {
  const artifactAbsPath = resolve(opts.artifactPath);
  const artifactText = readFileOrThrow(artifactAbsPath);
  const parsed: unknown = parse(artifactText);

  // Artifact SHAPE is validated loudly (PR #3 review C3): an empty file, a
  // top-level scalar/array, or a typo'd wrapper key used to degrade to zero
  // entries and a green `applied=0 preserved=0 skipped=0` run — the
  // operator believes the backfill ran. Only an explicitly-empty
  // `reclassifications: []` is a legal zero-work artifact.
  if (parsed === null || parsed === undefined || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `refusing to reclassify: artifact ${opts.artifactPath} is not a YAML mapping (got: ${Array.isArray(parsed) ? "array" : parsed === null || parsed === undefined ? "empty document" : typeof parsed})`,
    );
  }
  const artifact = parsed as ArtifactShape;
  if (!("reclassifications" in artifact)) {
    const found = Object.keys(artifact);
    throw new Error(
      `refusing to reclassify: artifact ${opts.artifactPath} has no "reclassifications" key (found top-level key(s): ${found.length ? found.map((k) => JSON.stringify(k)).join(", ") : "none"})`,
    );
  }
  if (!Array.isArray(artifact.reclassifications)) {
    throw new Error(
      `refusing to reclassify: artifact ${opts.artifactPath} "reclassifications" is not a list (got: ${typeof artifact.reclassifications})`,
    );
  }
  const rawEntries = artifact.reclassifications;

  const bundleDir = join(opts.targetRepo, "docs/asbuilt");
  const bundleDirAbs = resolve(bundleDir);

  // Codepoint-sorted deterministic order (AC10) — applied to validation
  // reporting order too, so violation messages and apply-phase writes are
  // stable regardless of the artifact's own entry order.
  const sortedRaw = [...rawEntries].sort((a, b) => {
    const ac = typeof a.concept === "string" ? a.concept : "";
    const bc = typeof b.concept === "string" ? b.concept : "";
    return ac < bc ? -1 : ac > bc ? 1 : 0;
  });

  // Phase 1 (validate + stage — EVERYTHING that can fail happens here,
  // before the first write): suggested_type shape, concept-path containment
  // and existence, concept readability/parseability, classification, and
  // the rewritten content itself. Collects EVERY violation instead of
  // throwing on the first (AC9's multi-violation test).
  const violations: string[] = [];
  const applied: string[] = [];
  const preserved: ReclassifySkip[] = [];
  const skipped: ReclassifySkip[] = [];
  const stagedWrites: { conceptAbsPath: string; concept: string; newContent: string }[] = [];

  for (const raw of sortedRaw) {
    const rawConcept = typeof raw.concept === "string" ? raw.concept : String(raw.concept ?? "");
    const concept = normalizeConceptPath(rawConcept);
    const suggested = raw.suggested_type;

    let malformedReason: string | null = null;
    if (typeof suggested !== "string") {
      malformedReason = `suggested_type is not a string (got: ${JSON.stringify(suggested)})`;
    } else if (suggested.trim() === "") {
      malformedReason = "suggested_type is empty";
    } else if (suggested.includes("\n")) {
      malformedReason = "suggested_type is multi-line";
    }
    if (malformedReason !== null) {
      violations.push(`${rawConcept}: ${malformedReason}`);
      continue;
    }
    const suggestedType = suggested as string;

    // Bundle containment (PR #3 review C2): `join` resolves `..` happily, so
    // a concept path like `../../outside.md` used to rewrite arbitrary repo
    // markdown and report it as a clean apply. The expected failure mode is
    // an LLM emitting one wrong relative prefix — refuse it loudly.
    const conceptAbsPath = resolve(bundleDirAbs, concept);
    const relToBundle = relative(bundleDirAbs, conceptAbsPath);
    if (relToBundle.startsWith("..") || isAbsolute(relToBundle)) {
      violations.push(`${rawConcept}: escapes the bundle (resolves outside docs/asbuilt/)`);
      continue;
    }
    if (!existsSync(conceptAbsPath)) {
      violations.push(`${rawConcept}: unknown concept path`);
      continue;
    }

    // Read + parse HERE, not in the write phase (PR #3 review C1): a concept
    // with malformed frontmatter — ordinary drift — is a collected phase-1
    // violation like any other, never a mid-write abort that leaves earlier
    // entries on disk while "refusing to reclassify" implies nothing happened.
    let read: ReturnType<typeof readConcept>;
    try {
      read = readConcept(conceptAbsPath, concept);
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).replace(/^refusing to reclassify: /, "");
      violations.push(`${rawConcept}: ${message}`);
      continue;
    }
    const { content, frontmatterBlock, frontmatter, rawBody } = read;

    // Enrichment gate — explicit allowlist, failing toward skip (PR #3
    // review: any value other than the literal "none" used to count as
    // enriched, so a typo'd or future vocabulary value fell through to
    // apply; same permissive-fallthrough shape PR #2's review found).
    const enrichment = frontmatter.enrichment;
    if (enrichment === undefined || enrichment === "none" || typeof enrichment !== "string") {
      skipped.push({ concept, reason: "skeleton-only concept (enrichment: none)" });
      continue;
    }
    if (enrichment !== "accuracy-audited" && enrichment !== "fully-audited") {
      skipped.push({
        concept,
        reason: `unrecognized enrichment value ${JSON.stringify(enrichment)} — not treated as enriched (fail toward skip)`,
      });
      continue;
    }

    // Shared precedence core (concept.ts decideSemanticType, claw-jeh5) —
    // machineOwnedTestGuard: reclassify defers to a machine-owned existing
    // `type: Test` even on a non-test resource (DISCLOSED divergence: fold
    // applies there).
    const outcome = decideSemanticType(frontmatter.type, frontmatter.resource, suggestedType, {
      machineOwnedTestGuard: true,
    });
    switch (outcome) {
      case "skip-machine-literal":
        skipped.push({
          concept,
          reason: `suggested_type "${suggestedType}" is machine vocabulary (Module/Test); treated as absent`,
        });
        break;
      case "skip-unknown-resource":
        skipped.push({
          concept,
          reason: "resource missing or non-string — test boundary indeterminate; suggestion not applied (fail toward skip)",
        });
        break;
      case "skip-test-boundary":
        skipped.push({
          concept,
          reason: "test-classified resource (filename pattern); type is machine-owned — suggestion never applied across the test boundary",
        });
        break;
      case "skip-machine-owned":
        skipped.push({ concept, reason: "current type is machine-owned Test classification; not reclassified" });
        break;
      case "preserve":
        preserved.push({
          concept,
          reason: `existing type ${JSON.stringify(frontmatter.type)} preserved (first-semantic-wins)`,
        });
        break;
      case "apply": {
        const newFrontmatterBlock = rewriteTypeLine(frontmatterBlock, suggestedType);
        const newContent = newFrontmatterBlock + rawBody;
        if (newContent !== content) {
          stagedWrites.push({ conceptAbsPath, concept, newContent });
        }
        applied.push(concept);
        break;
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(`refusing to reclassify: ${violations.length} violation(s):\n${violations.map((v) => `  - ${v}`).join("\n")}`);
  }

  // Phase 2: WRITE — a pure loop over staged content. No reads, no parsing,
  // nothing left that can throw between the first write and the last.
  for (const write of stagedWrites) {
    writeFileSync(write.conceptAbsPath, write.newContent);
  }

  return { applied, preserved, skipped };
}

export const CLI_USAGE = "bun asbuilt/src/reclassify.ts --target <repo> --artifact <path>";

// CLI entry guard — no module-level side effects (importing this file for
// tests must never trigger a CLI run; see claw-8cjf.2 / extract.ts).
if (import.meta.main) {
  const targetRepo = argValue("--target");
  const artifactPath = argValue("--artifact");

  if (!targetRepo || !artifactPath) {
    console.error(CLI_USAGE);
    process.exit(1);
  }

  try {
    const { applied, preserved, skipped } = reclassify({ targetRepo, artifactPath });
    console.log(`applied=${applied.length} preserved=${preserved.length} skipped=${skipped.length}`);
    // Per-entry reasons, not just counts (PR #3 review): `skipped=47` alone
    // cannot tell an operator whether those were skeleton-only,
    // machine-vocabulary, or test-boundary skips — three completely
    // different remediations. Order is already deterministic (AC10).
    for (const entry of preserved) {
      console.log(`  preserved: ${entry.concept} — ${entry.reason}`);
    }
    for (const entry of skipped) {
      console.log(`  skipped: ${entry.concept} — ${entry.reason}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
