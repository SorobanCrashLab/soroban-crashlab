# Advanced Form System (WIP)

Tracks issue #2278. This is an early scaffold, not a complete implementation.

`react-hook-form` is not yet a project dependency, so these primitives use plain React state
via `useAppForm` rather than the form library named in the issue's proposed solution. Zod
(`zod@^3.24.2`) is already a dependency and is used for schema validation.

## Status

- [x] `validateWithSchema` (zod-backed) and a server-error-mapping stub
- [x] `useAppForm` hook (plain React state, not react-hook-form)
- [x] `FormProvider`/`useFormContext` context plumbing
- [x] Field primitives: text, select, array, key-value, toggle
- [x] `Wizard`/`Stepper` components (no per-step validation or persistence yet)
- [x] `DraftStore`/`useAutosave` (localStorage only, no server sync)
- [ ] Integration with a dedicated form library for 100+ field performance
- [ ] Conditional logic / cross-field dependency validation
- [ ] Server-side draft persistence and conflict resolution on concurrent edits
- [ ] Per-step validation and resumable wizard sessions
- [ ] Unsaved-changes navigation guards
- [ ] Migration of campaigns/integrations/settings forms to this system

## Code

- `apps/web/src/components/forms/`

See the full requirements in issue #2278.
