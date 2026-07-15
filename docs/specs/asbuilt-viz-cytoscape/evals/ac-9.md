# Eval AC9 — dependencies are pinned, recorded, and offline-verifiable

Observable success: A maintainer inspecting the repository can answer, without
network access: which third-party rendering libraries ship inside the
artifact, exactly which released version of each, and under what license. The
vendored files carry that record (manifest or headers). Running the project's
tests on a machine with no network access succeeds.

Anti-patterns this catches: "Loading any library from a CDN at build or view
time" (spec anti-pattern #4) at its build-time root — an unpinned or
unrecorded dependency is how CDN drift sneaks back in.

Would fail if:
- Any vendored library's version or license cannot be determined from the
  repository alone.
- A vendored file drifts from any identifiable released version with no
  record of what changed.
- Tests or builds reach for a package registry or CDN to succeed.
