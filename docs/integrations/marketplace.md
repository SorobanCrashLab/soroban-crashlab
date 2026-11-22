# Integration marketplace

The integrations hub at `/integrations` is the directory for supported external
services. Search by service, capability, or prerequisite, or filter by category.
Each card links to the existing configuration page, available activity view, and
the provider's documentation.

The **Setup available** status means that CrashLab has a setup or feature page
for the integration. It does not indicate that credentials are configured or
that a provider connection is healthy. Use the integration's configuration page
to enter credentials and run its connection test where available. Do not treat
catalog presence as a health check.

Catalog metadata is maintained in
[`apps/web/src/features/integrations/marketplace/catalog.ts`](../../apps/web/src/features/integrations/marketplace/catalog.ts).
When adding an entry, verify that its destination exists, keep capability and
prerequisite text actionable, and link only to trusted provider documentation.
