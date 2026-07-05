// Shared fenced-code-aware heading detection for the As-Built Knowledge
// System (SPEC-049 Task 2 review fix; Task 4 added level-2 detection for
// log.md structure). concept.ts (splitConcept), fold.ts
// (parseDecisionsSection, parseCitationsSection), and verify.ts
// (enriched-zone-in-skeleton R3, missing-structure R4, log-structure) need
// to answer "does this body contain heading X" or "where is the next
// heading" WITHOUT being fooled by a heading-shaped line that's actually
// inside a fenced code block (e.g. an Explanation quoting `# Decisions` as a
// literal example). This module is the single place that fence-tracking
// logic lives; every other file imports it instead of keeping its own copy.

export interface HeadingLine {
  /** Trailing-whitespace-stripped line text, e.g. "# Explanation". */
  line: string;
  /** 0-based index into `content.split("\n")`. */
  index: number;
}

/**
 * Fence-tracking line scan shared by `headingLines` and `headingLinesLevel2`:
 * walks `content` line by line, toggling fence state on any line matching
 * /^ {0,3}(```|~~~)/ (both back-tick and tilde fences), and calls `isMatch`
 * on every line found OUTSIDE a fence. A heading-shaped line encountered
 * while `inFence` is true is skipped — this is what stops a literal
 * "# Explanation" or "## 2026-07-04" inside a ```-fenced example from being
 * mistaken for a real section/heading boundary.
 */
function scanHeadingLines(content: string, isMatch: (line: string) => boolean): HeadingLine[] {
  const lines = content.split("\n");
  const out: HeadingLine[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/\s+$/, "");
    if (/^ {0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (isMatch(line)) {
      out.push({ line, index: i });
    }
  }
  return out;
}

/**
 * Returns every line in `content` that opens a level-1 ATX heading
 * (`# ...`, up to 3 leading spaces, CommonMark-tolerant trailing
 * whitespace), EXCLUDING any such line found inside a fenced code block.
 * See `scanHeadingLines` for the fence-tracking discipline.
 */
export function headingLines(content: string): HeadingLine[] {
  return scanHeadingLines(content, (line) => /^ {0,3}#\s/.test(line));
}

/**
 * Returns every line in `content` that opens a level-2 ATX heading
 * (`## ...`), fence-aware exactly like `headingLines`. Used by verify.ts's
 * log.md structural validation (SPEC-049 Task 4) to find every `## `
 * date-group heading — including malformed ones (e.g. `## July 4`), which
 * `headingLines` (level-1 only) would never see.
 */
export function headingLinesLevel2(content: string): HeadingLine[] {
  return scanHeadingLines(content, (line) => /^ {0,3}##\s/.test(line));
}

/**
 * True when `line` (already trailing-whitespace-stripped, e.g. from a
 * `HeadingLine`) is exactly the ATX heading `heading` (e.g. "# Explanation"),
 * tolerant of up to 3 leading spaces per CommonMark's ATX indent rule.
 */
export function isExactHeading(line: string, heading: string): boolean {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^ {0,3}${escaped}$`).test(line);
}

/** True when `content` contains an out-of-fence line matching exactly `heading`. */
export function hasHeadingLine(content: string, heading: string): boolean {
  return headingLines(content).some(({ line }) => isExactHeading(line, heading));
}
