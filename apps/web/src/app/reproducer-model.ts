/**
 * Shared intermediate model for reproduction snippet exporters.
 *
 * Issue: #1666 - Python and Rust reproduction snippet exporters alongside the
 * existing TypeScript one.
 *
 * A `CaseBundleExport` (the JSON-serializable bundle produced by the Rust
 * generator) is normalized into a `ReproducerModel` that the TypeScript, Rust,
 * and Python emitters all consume. Keeping the normalization here means a
 * bundle schema change touches exactly one place instead of three emitters.
 */

/** Optional recorded environment fingerprint captured with the failing bundle. */
export interface ReproducerEnvFingerprint {
  /** Soroban RPC endpoint the run executed against, when recorded. */
  sorobanRpcUrl?: string;
  /** Network passphrase (e.g. Testnet / Futurenet), when recorded. */
  networkPassphrase?: string;
  /** Contract id the invocation targeted, when recorded. */
  contractId?: string;
}

/** A recorded invoke argument: name plus its serialized value. */
export interface ReproducerInvokeArg {
  name: string;
  /** Value serialized as hex (XDR) or a stable JSON string. */
  value: string;
}

/**
 * JSON-serializable form of a failing case bundle as produced by the Rust
 * generator. This is the input shape all emitters are driven by.
 */
export interface CaseBundleExport {
  seedId: number;
  inputPayloadHex: string;
  failureClass: string;
  signatureHash: string;
  mode: string;
  /** Optional recorded environment fingerprint. */
  envFingerprint?: ReproducerEnvFingerprint;
  /** Optional recorded invoke arguments. */
  invokeArgs?: ReproducerInvokeArg[];
}

/**
 * Normalized model consumed by every emitter. Field names are language-neutral
 * so the Rust and Python emitters can read them without bundle-shape knowledge.
 */
export interface ReproducerModel {
  seedId: number;
  /** Seed/replay payload as a hex string. */
  payloadHex: string;
  /** Execution mode: "invoker" | "contract" | "none". */
  mode: string;
  /** Expected failure class (e.g. "runtime-failure"). */
  failureClass: string;
  /** Signature hash as a hex string. */
  signatureHash: string;
  /** Optional recorded environment fingerprint. */
  envFingerprint?: ReproducerEnvFingerprint;
  /** Optional recorded invoke arguments. */
  invokeArgs?: ReproducerInvokeArg[];
}

const HEX_RE = /^(0x|0X)?[0-9a-fA-F]+$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates a hex field. An optional `0x`/`0X` prefix is accepted (legacy
 * bundles embed signature hashes with a prefix). The value is returned
 * verbatim so emitters reproduce the bundle byte-for-byte.
 */
function normalizeHex(value: unknown, field: string): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`Invalid case bundle: ${field} must be a non-empty hex string`);
  }
  const hexBody = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
  if (!HEX_RE.test(`0x${hexBody}`) || hexBody.length % 2 !== 0) {
    throw new Error(`Invalid case bundle: ${field} must be an even-length hex string`);
  }
  return value;
}

/**
 * Normalizes a `CaseBundleExport` into the shared `ReproducerModel`.
 *
 * Throws a descriptive `Error` (never a bare assertion or a type crash) when
 * the bundle is malformed, so callers and emitters can surface a clean
 * "invalid bundle" message instead of generating garbage.
 */
export function buildReproducerModel(bundle: CaseBundleExport): ReproducerModel {
  if (bundle === null || typeof bundle !== 'object') {
    throw new Error('Invalid case bundle: expected an object');
  }

  if (!Number.isFinite(bundle.seedId) || bundle.seedId < 0) {
    throw new Error('Invalid case bundle: seedId must be a non-negative finite number');
  }

  const payloadHex = normalizeHex(bundle.inputPayloadHex, 'inputPayloadHex');
  const signatureHash = normalizeHex(bundle.signatureHash, 'signatureHash');

  if (!isNonEmptyString(bundle.failureClass)) {
    throw new Error('Invalid case bundle: failureClass must be a non-empty string');
  }
  if (!isNonEmptyString(bundle.mode)) {
    throw new Error('Invalid case bundle: mode must be a non-empty string');
  }

  const model: ReproducerModel = {
    seedId: bundle.seedId,
    payloadHex,
    mode: bundle.mode,
    failureClass: bundle.failureClass,
    signatureHash,
  };

  if (bundle.envFingerprint !== undefined) {
    const { sorobanRpcUrl, networkPassphrase, contractId } = bundle.envFingerprint;
    if (
      (sorobanRpcUrl !== undefined && !isNonEmptyString(sorobanRpcUrl)) ||
      (networkPassphrase !== undefined && !isNonEmptyString(networkPassphrase)) ||
      (contractId !== undefined && !isNonEmptyString(contractId))
    ) {
      throw new Error('Invalid case bundle: envFingerprint fields must be non-empty strings when present');
    }
    model.envFingerprint = {
      ...(sorobanRpcUrl !== undefined ? { sorobanRpcUrl } : {}),
      ...(networkPassphrase !== undefined ? { networkPassphrase } : {}),
      ...(contractId !== undefined ? { contractId } : {}),
    };
  }

  if (bundle.invokeArgs !== undefined) {
    if (!Array.isArray(bundle.invokeArgs)) {
      throw new Error('Invalid case bundle: invokeArgs must be an array');
    }
    model.invokeArgs = bundle.invokeArgs.map((arg, index) => {
      if (arg === null || typeof arg !== 'object' || !isNonEmptyString(arg.name) || !isNonEmptyString(arg.value)) {
        throw new Error(`Invalid case bundle: invokeArgs[${index}] must have non-empty name and value`);
      }
      return { name: arg.name, value: arg.value };
    });
  }

  return model;
}

/**
 * Converts a hex string into a `0x..`-separated byte literal safe to embed in
 * Rust source (e.g. `vec![0xde, 0xad, 0xbe, 0xef]`). An optional `0x`/`0X`
 * prefix is stripped first.
 */
export function hexToRustByteLiteral(hex: string): string {
  const body = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  const bytes = body.match(/.{2}/g) ?? [];
  return bytes.map((byte) => `0x${byte}`).join(', ');
}