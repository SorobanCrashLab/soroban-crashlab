# Remove Simulated Network Failure on Home, Keep Demo Optional via Query Flag

## Summary

This PR removes the default simulated network failure from the dashboard home page, ensuring a stable user experience during normal operation. The loading-state demo behavior is now opt-in and only activates when the `?demoLoading=1` query parameter is present in the URL.

## Changes

### Modified Files
- `apps/web/src/app/page.tsx`

### Key Changes
1. **Added query flag detection**: Introduced `demoLoading` constant that reads the `demoLoading` query parameter from the URL
2. **Updated failure simulation logic**: Modified the data fetching `useEffect` to only simulate network failures when `demoLoading === true`
3. **Updated dependency array**: Added `demoLoading` to the `useEffect` dependency array to ensure proper re-fetching when the flag changes

### Behavior

#### Default Mode (Normal Operation)
- URL: `http://localhost:3000/` or any route without `?demoLoading=1`
- Behavior: Data loads normally without random failures
- User Experience: Stable, predictable loading

#### Demo Mode (Testing/Presentation)
- URL: `http://localhost:3000/?demoLoading=1`
- Behavior: ~10% chance of simulated network failure to demonstrate error handling
- User Experience: Showcases loading states and error recovery UI

## Testing

### Manual Testing
1. **Normal mode**: Visit the home page without query parameters - should load successfully every time
2. **Demo mode**: Visit `/?demoLoading=1` - should occasionally show the error state (refresh multiple times to observe)
3. **Toggle behavior**: Switch between modes by adding/removing the query parameter

### Verification
- ✅ No TypeScript errors in `page.tsx`
- ✅ Changes are scoped to a single file
- ✅ No lockfile changes
- ✅ No package.json modifications
- ✅ Existing UI behavior preserved (only failure simulation toggle changed)

## Implementation Details

The implementation is minimal and focused:

```typescript
// Added query flag detection
const demoLoading = searchParams.get("demoLoading") === "1";

// Updated failure simulation condition
if (demoLoading && Math.random() < 0.1)
  reject(new Error("Simulated network error"));
```

The `demoLoading` flag is:
- Read from URL search parameters using Next.js `useSearchParams` hook
- Checked before simulating failures in the data fetch logic
- Included in the `useEffect` dependency array for proper reactivity

## Closes

Closes #602

---

**Branch**: `issue/15-remove-random-fetch-failure`  
**Target**: `main`  
**Commit**: `fix(web): make home loading demo opt-in via query flag (ROADMAP-015)`
