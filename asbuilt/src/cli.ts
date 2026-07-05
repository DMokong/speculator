// Shared CLI argument-parsing helpers for the As-Built Knowledge System CLIs
// (SPEC-049 Task 1). Every CLI module (extract, skeleton, verify, slice,
// check, evidence) imports these instead of keeping its own copy — see
// task-1-brief.md. Pure functions of `process.argv`; no module-level side
// effects, so importing this file never has an effect beyond defining these
// two functions.

export function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}
