// Tests for the shared CLI argument-parsing helpers (SPEC-049 Task 1).
//
// Also carries two hardening invariants for the whole src/ tree: exactly one
// module may define `argValue` (cli.ts — every other CLI module must import
// it rather than keep a local copy), and no test file may hardcode a literal
// tmp-dir path (test isolation — see extract.test.ts's mkdtempSync fix).

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { argValue, hasFlag } from "../src/cli";

const SRC_DIR = new URL("../src", import.meta.url).pathname;
const TESTS_DIR = new URL(".", import.meta.url).pathname;

/** Temporarily replaces process.argv for the duration of `fn`, always restoring it after. */
function withArgv<T>(argv: string[], fn: () => T): T {
  const original = process.argv;
  process.argv = [...original.slice(0, 2), ...argv];
  try {
    return fn();
  } finally {
    process.argv = original;
  }
}

describe("cli: argValue", () => {
  test("returns the value following the flag in a synthetic argv", () => {
    withArgv(["--target", "/some/repo", "--out", "/out/path"], () => {
      expect(argValue("--target")).toBe("/some/repo");
      expect(argValue("--out")).toBe("/out/path");
    });
  });

  test("returns undefined when the flag is absent", () => {
    withArgv(["--out", "/out/path"], () => {
      expect(argValue("--target")).toBeUndefined();
    });
  });

  test("returns undefined when the flag is the last argv entry (no following value)", () => {
    withArgv(["--target"], () => {
      expect(argValue("--target")).toBeUndefined();
    });
  });
});

describe("cli: hasFlag", () => {
  test("true when the flag is present anywhere in argv", () => {
    withArgv(["--artifact", "/a.yml", "--graph-unavailable"], () => {
      expect(hasFlag("--graph-unavailable")).toBe(true);
    });
  });

  test("false when the flag is absent", () => {
    withArgv(["--artifact", "/a.yml"], () => {
      expect(hasFlag("--graph-unavailable")).toBe(false);
    });
  });
});

describe("hardening: argValue has exactly one definition, in cli.ts", () => {
  test("no src/*.ts file besides cli.ts defines a local argValue", () => {
    const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".ts"));
    let totalMatches = 0;
    const definingFiles: string[] = [];
    for (const file of files) {
      const content = readFileSync(join(SRC_DIR, file), "utf8");
      const matches = content.match(/function argValue\(/g) ?? [];
      totalMatches += matches.length;
      if (matches.length > 0) definingFiles.push(file);
    }
    expect(totalMatches).toBe(1);
    expect(definingFiles).toEqual(["cli.ts"]);
  });
});

describe("hardening: test isolation — no hardcoded /tmp/ literals", () => {
  test("no tests/*.test.ts file contains a literal /tmp/ string", () => {
    const files = readdirSync(TESTS_DIR).filter((f) => f.endsWith(".test.ts"));
    const offenders = files.filter((f) => /["'`]\/tmp\//.test(readFileSync(join(TESTS_DIR, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
