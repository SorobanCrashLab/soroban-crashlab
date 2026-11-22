# XDR / ScVal Inspector

The inspector for #2293 runs locally in a Web Worker. Open `/xdr-inspector`, or choose **Inspect XDR / ScVal** from a run's detail page. Run trace, artifact-preview and reproduction-snippet screens also link to it. Run-scoped URLs use `/runs/<id>/payloads`.

## Decode and navigate

1. Select the exact root type and encoding. Supported roots are `ScVal`, `LedgerEntry`, `LedgerKey`, `ContractEvent`, `SorobanAuthorizationEntry`, `HostFunction`, `SorobanTransactionData` and `ScSpecEntry`.
2. Paste base64, hex or typed JSON, or select a file. The initial example `AAAAAwAAAAc=` is `ScVal::U32(7)`. Paste is capped at 64 KiB; files support up to 5 MiB decoded XDR (up to 15 MiB encoded text, or 32 MiB typed JSON).
3. Choose **Decode A**. Expand containers with right/left arrows, double-click, or **Toggle selected container**. Up/down and home/end navigate the current tree page. Search names, SDK types, paths, schema labels and bounded value previews. **Previous/Next nodes** pages through 50 visible/search-result rows at a time.
4. Selecting a node highlights its wire byte range. Click a raw line or enter an exact byte offset to navigate back to the deepest containing node. Raw windows contain at most 1 KiB, including context bytes.
5. Copy a node's RFC 6901 JSON pointer or a bookmark URL. The URL includes context and a node path only. A recipient imports the same authorized payload and the selected path is restored on decode. Payload bytes and schema text are never placed in URLs.

The complete payload stays in the worker. There is no backend decode call, storage write or RPC transaction. Unknown protocol discriminators, excessive node/depth counts and unsupported layouts retain the original bytes in an explicitly read-only raw fallback.

## Edit and verify

Select a subtree to edit its typed node JSON. The representation preserves:

- structs as exact named `fields`;
- unions as `switch` plus a typed `value`;
- enums by schema member name;
- optional presence independently of an empty vector/map;
- arrays as typed `items`;
- signed/unsigned 64-bit parts as decimal strings;
- opaque/invalid-UTF-8 strings as hexadecimal bytes, and valid UTF-8 as text.

For example, the value child of `ScVal::U32(7)` at `/value` is:

```json
{"kind":"scalar","value":7}
```

Change `7` to `9`, then choose **Validate and re-encode**. Every edit validates SDK type/length/integer bounds, exact struct fields, map-key uniqueness and attached schema constraints. Encoding is followed by a new decode and byte-stable re-encode. A failure leaves the last accepted payload unchanged. These are wire/schema checks, not a simulation of contract execution or authorization.

Union/enum selectors create the appropriate typed arm. Optional controls distinguish absent/present. Vector/map arrays have add/remove controls; map additions receive unique placeholder symbol keys. Select child nodes to edit their values. Full subtree JSON can also change nested values. Subtrees over 64 KiB are inspectable but not sent to the main-thread editor; select smaller children.

SDK encoding fixes wire padding and follows generated field order. Map/vector ordering remains explicit and significant; the inspector does not silently reorder a reproducer. Input encodings that differ from the SDK's canonical bytes are flagged. Raw comparison uses original input bytes; exact export uses the accepted document's SDK re-encoding.

## Contract metadata

For a function's argument vector, or a named struct's ScVal map/tuple, paste actual base64 ScSpecEntry records:

```json
{"spec":["<base64 ScSpecEntry>","<another entry>"],"name":"transfer"}
```

Function inputs receive ABI names, documentation, argument-count checks and supported scalar/container ScVal discriminant constraints. Structs receive required field names/counts and matching wire-type constraints. Invalid schema attachment does not replace the previously valid schema. Unsupported UDT/extension semantics remain in the generic XDR view; the inspector does not claim full contract-execution validation.

Callers with already-resolved metadata can attach explicit paths:

```json
{"version":1,"fields":[{"path":"/value","label":"count","expectedType":"UnsignedInt","description":"Counter value"}]}
```

Metadata is bounded to 256 KiB / 256 encoded spec entries / 1,000 path annotations. Labels and descriptions render as text. Schema data never selects executable constructors or module paths.

## Compare and export

Load payload B using the root/encoding selected in the input controls. Comparison reports deterministic added/removed/changed paths, byte counts and first differing offset. Click a changed/removed path to select it in A. Added-only paths are shown without a misleading A selection. Structural results are capped at 2,000 changes with a truncation notice; raw comparison still covers the full bounded byte buffers.

Exports:

| Format | Contents |
| --- | --- |
| JSON | Version 1 typed fixture, importable when exact/unredacted |
| hex/base64 | SDK re-encoding of the accepted document; available only with redaction disabled |
| TypeScript fixture | Redacted evidence object, or an exact `xdr.<Root>.fromXDR(...)` SDK reproducer |

Redaction defaults on and removes every payload leaf value, rather than trying to detect secrets inside encoded bytes. Redacted JSON is evidence, not a valid exact reproducer; import explicitly rejects it. Disable redaction deliberately for exact fixture/hex/base64 exports and review those files before attaching them to an issue. Exact fixture snippets contain data literals and a fixed SDK constructor; payload text is never interpolated as executable source.

Existing artifact permission/redaction controls remain authoritative. Artifact entry links preserve the artifact identifier and ask for an authorized local export. They do not bypass quarantines or sensitive-content permissions to fetch raw bytes. The reusable `XdrScValInspector` accepts initial payload text and an optional export callback for future authorized data providers.

## Resource limits and failure handling

| Resource | Bound / behavior |
| --- | --- |
| Decoded wire bytes | 5 MiB |
| Indexed typed nodes | 100,000 |
| Typed-node nesting | 64 levels (SDK decoder also has its own depth guard) |
| Tree response / DOM | 50 rows per page |
| Raw preview | 1 KiB per request |
| Subtree editor | 64 KiB |
| Worker deadline | 30 seconds; terminate and require a new decode |
| Export redaction | Worker-side; no original binary embedded in redacted evidence |

Large JSON parsing, hex/base64 conversion, SDK decode/encode, diff and export run in the worker. A file is transferred as a browser File and read there. Cancel terminates queued and active operations. A render error boundary offers a reset. No-worker browsers fail explicitly rather than freezing the UI with a synchronous decoder.

## Verification

From the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm --dir apps/web exec vitest run src/lib/xdr src/features/xdr-inspector --minWorkers=1 --maxWorkers=2
pnpm --dir apps/web exec tsc -p tsconfig.xdr-inspector.json --noEmit
pnpm --dir apps/web run lint
pnpm --dir apps/web exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/web exec tsc -p tsconfig.test.json --noEmit
pnpm --dir apps/web run test
pnpm --dir apps/web run build
pnpm --dir apps/web exec playwright test e2e/xdr-inspector.spec.ts --project=chromium
```

See [ADR-0013](../adr/0013-worker-xdr-inspection.md) for the worker/security boundary. Record actual browser/5 MiB timings and check results in the PR rather than treating these commands as evidence that they already passed.
