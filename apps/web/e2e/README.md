# E2E Tests

This directory contains end-to-end tests using [Playwright](https://playwright.dev/).

## Setup

E2E tests require Playwright to be installed. Install dependencies:

```bash
npm install
# or
pnpm install
```

## Running Tests

### Run all tests
```bash
npm run test:e2e
```

### Run tests in UI mode (recommended for development)
```bash
npm run test:e2e:ui
```

### Debug tests
```bash
npm run test:e2e:debug
```

### Run specific test file
```bash
npx playwright test e2e/home.spec.ts
```

## Visual Regression

`e2e/visual.spec.ts` captures the landing page (`/`) and Start flow (`/start`)
across breakpoints (desktop/mobile) and themes (light/dark). It asserts against
committed snapshots in the `e2e/visual.spec.ts-snapshots/` directory.

Visual tests run only on the `chromium` project (the CI project); other local
browsers skip them so baselines stay deterministic.

### Updating baselines

After an intentional visual change, regenerate the baselines:

```bash
pnpm run test:e2e:update-snapshots
```

Then review the diff in git before committing.

### Thresholds

Screenshots tolerate a 2% pixel delta (`maxDiffPixelRatio: 0.02`) to absorb
font-rendering variance between OSes; animations are disabled and the caret
hidden. Dynamic regions count on the page are rendered at deterministic final
states under reduced motion.

### Run tests in specific browser
```bash
npx playwright test --project=chromium
# or firefox, webkit, Mobile Chrome, Mobile Safari
```

## Configuration

The Playwright configuration is defined in `playwright.config.ts` at the root of the `apps/web` directory. Key settings:

- **Base URL**: `http://localhost:3000` (development server)
- **Browsers**: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari
- **Dev Server**: Automatically starts with `npm run dev`
- **Screenshots**: Captured on test failure
- **Traces**: Captured on first retry

## Best Practices

1. **Locators**: Use semantic locators (role, label) instead of CSS selectors when possible
2. **Waits**: Avoid hard waits; use Playwright's built-in waiting mechanisms
3. **Cleanup**: Tests should be independent and not rely on execution order
4. **Naming**: Use descriptive test names that explain what's being tested
5. **Accessibility**: Include tests for keyboard navigation and screen reader support

## Test Structure

Each test file should:
- Have a descriptive `test.describe()` block
- Use `test.beforeEach()` for common setup (e.g., navigation)
- Include both happy path and error cases
- Add comments for complex test logic

## Debugging

- **Trace Viewer**: `npx playwright show-trace trace.zip`
- **Screenshot**: Check `test-results/` directory for failure screenshots
- **Video**: Enable in `playwright.config.ts` for slow motion debugging

## CI/CD Integration

Tests run on CI with:
- Single worker (no parallelization)
- 2 retries for flaky tests
- HTML reports generated in `playwright-report/`

## Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Test Assertions](https://playwright.dev/docs/test-assertions)
- [Selectors](https://playwright.dev/docs/locators)
