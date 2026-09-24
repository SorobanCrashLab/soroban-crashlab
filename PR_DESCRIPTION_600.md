# feat(web): use buildMockRuns for dashboard home (ROADMAP-013)

## Summary

Refactored the dashboard home page (`apps/web/src/app/page.tsx`) to use `buildMockRuns()` as the single source of truth for mock run data generation, eliminating the inline `MOCK_RUNS` constant that duplicated run generation logic.

## Changes

- **Removed** inline `MOCK_RUNS` array definition (33 lines) from `page.tsx`
- **Added** import for `buildMockRuns` from `./mockRuns`
- **Updated** data fetch logic to call `buildMockRuns()` instead of using the static `MOCK_RUNS` constant
- **Fixed** pre-existing JSON syntax error in `package.json` (missing comma after `test:timeline` script)

## Technical Details

The `buildMockRuns()` function in `mockRuns.ts` is now the centralized generator for dashboard home run data. This ensures:

- Consistent run data shape across all components
- Single source of truth for mock data generation
- Elimination of code duplication
- Easier maintenance and updates to mock data structure

The refactor maintains identical user-facing behavior - the dashboard home page renders the same run list with the same data structure.

## Testing

- Verified TypeScript compilation of modified files
- Confirmed no new type errors introduced by the refactor
- Validated that `buildMockRuns()` returns the expected `FuzzingRun[]` type
- Ensured the change is isolated to the specified files

## Maintainer Approval

**Note:** `package.json` was modified to fix a pre-existing syntax error (missing comma on line 12) that was blocking the build process. This fix was necessary to validate the refactor and ensure build stability. The syntax error existed before this PR and was unrelated to the mock runs consolidation.

Closes #600
