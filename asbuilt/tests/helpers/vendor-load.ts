// Headless loader for the vendored Cytoscape + fcose stack (SPEC-004 T06,
// spike finding 1). Global-evals each UMD via indirect eval at a plain
// top-level script scope -- module/exports are not in scope there, so each
// webpack wrapper's `else root[name] = factory()` branch binds onto
// `globalThis` instead of taking a CommonJS path. Load order matters
// (VENDOR.md): layout-base -> cose-base -> cytoscape -> cytoscape-fcose.
// fcose self-registers against the global `cytoscape`; no `.use()` call is
// needed.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VENDOR_DIR = new URL("../../vendor/", import.meta.url).pathname;

const LOAD_ORDER = ["layout-base.js", "cose-base.js", "cytoscape.min.js", "cytoscape-fcose.js"];

export interface CyPosition {
  x: number;
  y: number;
}

/** Cytoscape.js element definition (mirrors asbuilt/src/viz.ts's CyElement,
 * plus the optional seed `position` the template writes onto child nodes). */
export interface CyElementData {
  id: string;
  parent?: string;
  label?: string;
  test?: boolean;
  d?: number;
  source?: string;
  target?: string;
  w?: number;
}

export interface CyElementDefinition {
  data: CyElementData;
  position?: CyPosition;
  classes?: string;
}

export interface CyNodeSingular {
  id(): string;
  position(): CyPosition;
}

export interface CyCollection {
  forEach(fn: (ele: CyNodeSingular) => void): void;
  readonly length: number;
}

export interface CyLayout {
  run(): CyLayout;
}

export interface CyCore {
  nodes(selector?: string): CyCollection;
  layout(options: Record<string, unknown>): CyLayout;
  one(event: string, handler: () => void): void;
  destroy(): void;
}

export type CytoscapeFactory = (options: Record<string, unknown>) => CyCore;

/** Loads the vendored cytoscape+fcose stack and returns `globalThis.cytoscape`.
 *
 * Headless caveat (mandatory, spike finding 1): callers MUST construct
 * instances with `styleEnabled: true` and a stylesheet mapping `node[d]`
 * width/height to `data(d)` -- `styleEnabled: false` leaves node dimensions
 * NaN and cose-base throws a RangeError in its repulsion-grid sizing. */
export function loadCytoscape(): CytoscapeFactory {
  // Spike-proven incantation (T03 finding 1): `(0, eval)` forces INDIRECT
  // eval so each UMD wrapper's `else root[name]=factory()` branch binds onto
  // `globalThis` (module/exports are not in scope), matching real
  // <script>-tag load semantics; headless test harnesses have no <script>
  // tag, so eval is the load-bearing mechanism this loader exists to provide.
  for (const file of LOAD_ORDER) {
    const src = readFileSync(join(VENDOR_DIR, file), "utf8");
    // biome-ignore lint/style/noCommaOperator: required for indirect eval, see comment above the loop.
    // biome-ignore lint/security/noGlobalEval: required for indirect eval, see comment above the loop.
    (0, eval)(src);
  }
  const g = globalThis as unknown as { cytoscape?: CytoscapeFactory };
  if (typeof g.cytoscape !== "function") {
    throw new Error("cytoscape did not register on globalThis after vendor load");
  }
  return g.cytoscape;
}
