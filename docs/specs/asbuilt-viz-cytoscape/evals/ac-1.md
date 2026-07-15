# Eval AC1 — tests live with their source directory, no global tests cluster

Observable success: A viewer opening the viz of a dense flat-package bundle
sees each test file sitting inside the cluster of the directory whose code it
tests, visually marked as a test (badge/styling distinct from non-test
neighbors). Scanning the whole canvas, there is no separate all-tests cluster
anywhere — the count of clusters equals the count of source directories.

Anti-patterns this catches: "Renaming the global tests bucket while still
clustering all tests together spatially" (spec anti-pattern #5) — the eval
checks *where tests sit*, not what any group is called.

Would fail if:
- All test files gather into one cluster regardless of which directory they
  belong to (under any name).
- A directory's tests render outside that directory's cluster.
- A file whose recorded classification says "test" but whose filename does not
  look test-like loses its test marking — marking must follow the bundle's
  recorded classification, never be re-guessed from the file path.
