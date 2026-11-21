# i18n Contributor Guide

This guide covers how to work with internationalization (i18n) in the CrashLab frontend.

## Adding New Strings

### 1. Add to English Catalog

All user-visible strings must be in translation catalogs. **Never hardcode strings in components.**

```typescript
// ❌ BAD
<button>Save Changes</button>

// ✅ GOOD
const { t } = useTranslations();
<button>{t('common.actions.save')}</button>
```

Add new keys to the appropriate namespace in `src/i18n/catalogs/en/*.json`:

- `common.json` - Shared UI strings (buttons, status, validation)
- `runs.json` - Runs page
- `campaigns.json` - Campaigns page
- `triage.json` - Triage board
- `integrations.json` - Integrations
- `settings.json` - Settings
- `notifications.json` - Notifications

### 2. Use the Translation Hook

```typescript
import { useTranslations } from '@/i18n/context';

function MyComponent() {
  const { t, locale } = useTranslations();
  
  return <div>{t('runs.title')}</div>;
}
```

### 3. Interpolation

```json
{
  "message": "Showing {start} to {end} of {total} items"
}
```

```typescript
t('common.pagination.showing', { start: 1, end: 10, total: 100 })
// → "Showing 1 to 10 of 100 items"
```

### 4. Pluralization

Use ICU-style plural messages:

```json
{
  "itemCount": "{count, plural, one {# item} other {# items}}"
}
```

```typescript
t('common.itemCount', { count: 1 })  // → "1 item"
t('common.itemCount', { count: 5 })  // → "5 items"
```

## Formatting

Use the formatting utilities for locale-aware display:

```typescript
import { formatBytes, formatDate, formatRelativeSafe } from '@/i18n/formatting';
import { useTranslations } from '@/i18n/context';

function MyComponent() {
  const { locale, mounted } = useTranslations();
  
  return (
    <div>
      <p>{formatBytes(1536, locale)}</p>
      <p>{formatDate(new Date(), locale)}</p>
      <p>{formatRelativeSafe(timestamp, locale, mounted)}</p>
    </div>
  );
}
```

**Important**: Always use `formatRelativeSafe` (not `formatRelative`) in components that render during SSR to avoid hydration mismatches.

## Testing

Before committing, run:

```bash
pnpm --dir apps/web run i18n:check
```

This checks for:
- Missing keys in non-default locales
- Orphaned keys (present in translation but unused in code)

## CI Integration

The `i18n:check` script runs in CI. PRs will fail if:
- New keys are added to English but not translated
- Keys are deleted from catalogs

## RTL Support

When adding CSS, use logical properties:

```css
/* ❌ BAD */
margin-left: 1rem;
text-align: left;

/* ✅ GOOD */
margin-inline-start: 1rem;
text-align: start;
```

This ensures proper layout in RTL locales (Arabic, Hebrew).
