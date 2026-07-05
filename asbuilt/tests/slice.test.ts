import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { extractGraph } from "../src/extract";
import type { GraphManifest } from "../src/manifest";
import { graphSlice, touchedSymbols } from "../src/slice";

const FIXTURE = new URL("fixtures/fixture-repo", import.meta.url).pathname;
execSync(`bash ${join(FIXTURE, "seed.sh")}`);

/** seed.sh's default branch may be "main" or "master" depending on git config; detect which exists. */
function defaultBranch(): string {
  try {
    execSync(`git -C ${FIXTURE} rev-parse --verify main`, { stdio: "ignore" });
    return "main";
  } catch {
    return "master";
  }
}

/** Extracts the manifest at the `change` branch's state, then restores the fixture's original checkout. */
async function extractAtChange(defaultBr: string): Promise<GraphManifest> {
  execSync(`git -C ${FIXTURE} checkout -q change`);
  try {
    return await extractGraph(FIXTURE);
  } finally {
    execSync(`git -C ${FIXTURE} checkout -q ${defaultBr}`);
  }
}

describe("AC: diff-touched symbols + 1-hop graph slice", () => {
  test("touchedSymbols returns exactly the symbol whose body changed", async () => {
    const branch = defaultBranch();
    const manifest = await extractAtChange(branch);
    const touched = touchedSymbols(manifest, FIXTURE, `${branch}...change`);
    expect(touched).toEqual(["src/alpha.ts#helper"]);
  });

  test("graphSlice neighborhood includes the touched symbol and its 1-hop caller; files is deduped+sorted", async () => {
    const branch = defaultBranch();
    const manifest = await extractAtChange(branch);
    const touched = touchedSymbols(manifest, FIXTURE, `${branch}...change`);
    const slice = graphSlice(manifest, touched);

    expect(slice.touched).toEqual(["src/alpha.ts#helper"]);

    const ids = slice.neighborhood.map((s) => s.id);
    expect(ids).toContain("src/alpha.ts#helper");
    expect(ids).toContain("src/alpha.ts#AlphaService.run");
    // sorted by id
    expect(ids).toEqual([...ids].sort());

    expect(slice.files).toEqual(["src/alpha.ts"]);
  });

  test("touchedSymbols is empty for a no-op range", async () => {
    const branch = defaultBranch();
    const manifest = await extractAtChange(branch);
    const touched = touchedSymbols(manifest, FIXTURE, `${branch}...${branch}`);
    expect(touched).toEqual([]);
  });
});
