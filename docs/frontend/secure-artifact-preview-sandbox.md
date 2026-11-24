# Secure Artifact Preview Sandbox

The artifact preview sandbox (issue #2337) renders untrusted content without executing it.

## Trust model

- Content type is detected from MIME type, extension and content heuristics and routed to a viewer
  kind (`text`, `log`, `json`, `hex`, `binary`, `image`, `html`, `pdf`, `archive`).
- Previews are rendered in an iframe with `sandbox="allow-same-origin"`, `referrerPolicy="no-referrer"`
  and a strict CSP (`default-src 'none'`, inline styles only). All artifact text is HTML-escaped, so
  even a `<script>` in the artifact appears as inert text.
- `SANDBOX_POLICY.allowScripts` and `allowPlugins` are always `false`.

## Redaction

`redact` applies deterministic rules (Stellar secret keys, API tokens, email addresses) in a fixed
order, returns the masked text plus per-rule counts, and is idempotent. Masked values can only be
revealed when the caller has `canViewSensitive` permission; the reveal toggle is hidden otherwise.

## Forensics and policy

- `summarizeForForensics` reports line numbers, byte offsets, line lengths, encoding and a
  deterministic checksum (or a supplied integrity hash).
- `evaluateAccess` blocks quarantined artifacts, artifacts without a clean scan and sensitive
  artifacts without permission.
- `evaluateDownload` additionally enforces `allowDownload` and the caller's download permission.
  All preview/copy/download actions emit an audit callback.

## UI and API

- Page: `/artifacts/[id]/preview`
- API: `/api/artifacts/[id]/preview` — returns the sandboxed `srcDoc`, redaction findings,
  forensic summary and policy decisions; it never returns executable markup.
