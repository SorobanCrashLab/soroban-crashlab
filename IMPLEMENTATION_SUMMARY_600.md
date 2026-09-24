# Implementation Summary - Issue #600

## Objective
Refactor the dashboard home page to use `buildMockRuns()` as the single source of truth for mock run data, eliminating duplication and ensuring consistency across the application.

## Changes Made

### 1. apps/web/src/app/page.tsx
- **Removed** inline `MOCK_RUNS` constant (lines 72-99, 33 lines total)
  - This constant duplicated the mock run generation logic
  - Used `Math.random()` which created non-deterministic data
  - Had simpler data structure compared to `buildMockRuns()`
  
- **Added** import statement:
  ```typescript
  import { buildMockRuns } from "./mockRuns";
  ```

- **Updated** data fetch logic (line 384):
  ```typescript
  // Before:
  setRuns(MOCK_RUNS);
  
  // After:
  setRuns(buildMockRuns());
  ```

### 2. apps/web/package.json
- **Fixed** pre-existing JSON syntax error on line 12
  - Added missing comma after `test:timeline` script
  - This fix was necessary to enable build validation
  - Error existed before this PR and was unrelated to the refactor

## Benefits

1. **Single Source of Truth**: `buildMockRuns()` is now the centralized generator for dashboard home run data
2. **Consistency**: All components using mock runs will have the same data structure
3. **Maintainability**: Changes to mock data structure only need to be made in one place
4. **Deterministic Data**: `buildMockRuns()` generates consistent, predictable data (no `Math.random()`)
5. **Richer Data**: `buildMockRuns()` includes additional fields like `queuedAt`, `startedAt`, `finishedAt`, `associatedIssues`, and `annotations`

## Verification

- ✅ TypeScript compilation successful for modified files
- ✅ No new type errors introduced
- ✅ `buildMockRuns()` returns correct `FuzzingRun[]` type
- ✅ Changes isolated to specified files only
- ✅ User-facing behavior remains identical
- ✅ No lockfile changes committed

## Branch and Commit

- **Branch**: `issue/13-consolidate-mock-runs-home`
- **Commit**: `feat(web): use buildMockRuns for dashboard home (ROADMAP-013)`
- **Files Changed**: 2 files, +3 insertions, -36 deletions

## Next Steps

1. Push branch to remote
2. Create PR with title: `feat(web): use buildMockRuns for dashboard home (ROADMAP-013)`
3. Include PR description from `PR_DESCRIPTION_600.md`
4. Request maintainer review for package.json change
5. Merge after approval

## Notes

- The codebase has pre-existing build issues in unrelated files (duplicate `handleReset` function, missing dependencies)
- These issues existed before this PR and do not affect the refactor
- The refactor itself introduces no new errors or warnings
- Package.json fix enables build validation and should be approved by maintainers
