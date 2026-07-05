#!/bin/bash
# Re-inits the nested fixture git repo on demand. Nested .git dirs are not
# committable to the outer repo, so this script recreates the
# fixture repo's own git history at test time instead of checking in .git.
#
# Ordering note: this must only ever be run AFTER the outer repo has
# committed the fixture files (SPEC-048 Task 1). If run before that outer
# commit, `git add -A` in the outer repo would see a nested .git directory
# and record it as a gitlink (embedded-repo) entry instead of plain files.
cd "$(dirname "$0")"
# SPEC-049 Task 1: a checkout on this machine may already have a nested .git
# seeded before a fixture file (e.g. src/noexport.ts) was added here. The new
# file lands on disk via the OUTER repo's own checkout regardless of the
# nested repo's state, but `git -C fixture-repo ls-files` (what extract.ts
# actually calls) only returns paths the NESTED repo's index tracks — so a
# plain `[ -f src/noexport.ts ]` disk check can't tell "tracked" from
# "present on disk but untracked by the stale nested history" (both are true
# right after a pull lands this file next to a pre-existing stale .git).
# Ask the nested repo itself whether it tracks the file, and force a
# fresh re-seed if not, instead of silently testing against a stale tree.
if [ -d .git ] && ! git ls-files --error-unmatch src/noexport.ts >/dev/null 2>&1; then
  rm -rf .git
fi
[ -d .git ] && exit 0
git init -q && git add -A && git -c user.email=fixture@local -c user.name=fixture commit -qm seed
git checkout -qb change
sed -i '' 's/x \* 2/x * 3/' src/alpha.ts
git -c user.email=fixture@local -c user.name=fixture commit -qam "touch helper"
git checkout -q main 2>/dev/null || git checkout -q master
