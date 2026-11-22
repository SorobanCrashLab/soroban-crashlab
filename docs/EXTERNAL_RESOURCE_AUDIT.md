# External Resource Audit

The application shell is [layout.tsx](../apps/web/src/app/layout.tsx). The
checker in [check-external-origins.mjs](../scripts/check-external-origins.mjs)
scans its head `link` and `script` resource attributes. Same-origin paths are
exempt because they remain inside the application's own trust boundary.

| Resource | Kind | Verdict | Rationale |
| --- | --- | --- | --- |
| `/favicon/192x192/favicon.svg` | icon link | Keep | Same-origin application icon. |
| `/favicon/180x180/favicon.svg` | Apple touch icon | Keep | Same-origin mobile icon. |
| `/theme-script.js` | `next/script` | Keep | Same-origin theme initialization. |
| `fonts.googleapis.com` | stylesheet/preconnect | Kill | Removed after `next/font` self-hosting; no runtime font origin remains. |
| `fonts.gstatic.com` | preconnect | Kill | Removed with the Google font stylesheet; preconnect had no remaining consumer. |

There are currently no approved external head origins. A new external script or
stylesheet must be added to `ALLOWED_EXTERNAL_ORIGINS` only with maintainer
review and an explicit integrity, ownership, and privacy discussion.

The checker includes an injected-violation self-test and runs in CI. It is a
source guard, not a browser network monitor; runtime URLs created by application
features remain subject to their feature-specific validation and CSP policy.