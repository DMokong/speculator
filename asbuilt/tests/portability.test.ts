// Portability hygiene test (SPEC-051 Task 1). This package was ported from
// an internal personal-workspace repo into this plugin — it must carry zero
// trace of the origin project's name or its owner's name. A leftover
// reference (a stale comment, an unrewritten path, a copy-pasted error
// string) would leak provenance that has no business living in a published
// plugin.
//
// The forbidden substrings are built via string concatenation rather than
// spelled out literally, so this test file's own source text never contains
// the patterns it's checking for — otherwise this test would trivially fail
// against itself the moment it's included in the very tree it scans.

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_DIR = new URL("../src", import.meta.url).pathname;
const TESTS_DIR = new URL(".", import.meta.url).pathname;

// Origin project name and owner username, assembled from parts so neither
// appears verbatim in this file.
const ORIGIN_PROJECT = ["claude", "claw"].join("");
const OWNER_USERNAME = ["dustin", "cheng"].join("");

const FORBIDDEN = [ORIGIN_PROJECT, OWNER_USERNAME];

/** Recursively collects every regular file under `dir`. */
function walkFiles(dir: string, base: string = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, base));
    } else if (entry.isFile()) {
      out.push(relative(base, full));
    }
  }
  return out;
}

describe("portability: no origin-project or owner-username references", () => {
  const roots = [SRC_DIR, TESTS_DIR];

  test("zero case-insensitive matches under asbuilt/src and asbuilt/tests", () => {
    const hits: string[] = [];

    for (const root of roots) {
      for (const relPath of walkFiles(root)) {
        const absPath = join(root, relPath);
        // Skip anything that isn't a plain file (defensive; walkFiles already
        // filters to files, but statSync guards against dangling symlinks).
        if (!statSync(absPath).isFile()) continue;

        const text = readFileSync(absPath, "utf8");
        const lower = text.toLowerCase();
        for (const needle of FORBIDDEN) {
          if (lower.includes(needle)) {
            hits.push(`${root === SRC_DIR ? "src" : "tests"}/${relPath}: contains "${needle}"`);
          }
        }
      }
    }

    expect(hits).toEqual([]);
  });
});
