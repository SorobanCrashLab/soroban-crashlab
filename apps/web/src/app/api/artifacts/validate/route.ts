import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * CaseBundle schema version constant.
 * Must match CASE_BUNDLE_SCHEMA_VERSION in crashlab-core.
 */
export const CASE_BUNDLE_SCHEMA_VERSION = 2;

/**
 * Zod schema for a CaseSeed.
 * seed.id: non-negative integer identifier
 * seed.payload: byte array (0–64 bytes, configurable)
 */
const CaseSeedSchema = z.object({
  id: z.number().int().nonnegative(),
  payload: z.array(z.number().int().min(0).max(255)).min(1, "too short").max(64, "too long"),
});

/**
 * Zod schema for a CrashSignature.
 * category: stable failure class or legacy "runtime-failure"
 * digest: 64-bit FNV-1a hash
 * signature_hash: deterministic hash for artifact naming
 */
const CrashSignatureSchema = z.object({
  category: z.string().min(1),
  digest: z.number().int(),
  signature_hash: z.number().int(),
});

/**
 * Zod schema for EnvironmentFingerprint (optional).
 * Captures OS, CPU architecture, platform family, and tool version at bundle creation time.
 */
const EnvironmentFingerprintSchema = z.object({
  os: z.string().min(1),
  arch: z.string().min(1),
  family: z.string().min(1),
  version: z.string().min(1),
});

/**
 * Zod schema for a CaseBundle.
 * Top-level schema field is mandatory for versioned documents.
 * seed and signature are required.
 * environment and failure_payload are optional.
 */
const CaseBundleSchema = z.object({
  schema: z.literal(CASE_BUNDLE_SCHEMA_VERSION),
  seed: CaseSeedSchema,
  signature: CrashSignatureSchema,
  environment: EnvironmentFingerprintSchema.nullable().optional(),
  failure_payload: z.array(z.number().int().min(0).max(255)).optional(),
  rpc_envelope: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Union type allowing both versioned (schema field) and legacy bundles.
 * Legacy bundles lack the schema field but must still contain seed + signature.
 */
const LegacyCaseBundleSchema = z.object({
  schema: z.never().optional(),
  seed: CaseSeedSchema,
  signature: CrashSignatureSchema,
  environment: EnvironmentFingerprintSchema.nullable().optional(),
  failure_payload: z.array(z.number().int().min(0).max(255)).optional(),
});

const AcceptedCaseBundleSchema = z.union([
  CaseBundleSchema,
  LegacyCaseBundleSchema,
]);

/**
 * Seed validation constraints (mirrors SeedSchema in crashlab-core).
 */
const SEED_CONSTRAINTS = {
  minPayloadLength: 1,
  maxPayloadLength: 64,
  maxId: Number.MAX_SAFE_INTEGER,
};

/**
 * Validation result type returned to clients.
 */
export interface ValidationResult {
  valid: boolean;
  schemaVersion?: number;
  errors: string[];
  warnings: string[];
  seed?: {
    id: number;
    payloadLength: number;
  };
  signature?: {
    category: string;
    digest: number;
    signatureHash: number;
  };
  environment?: {
    os: string;
    arch: string;
    family: string;
    version: string;
  } | null;
}

function flattenIssues(issues: z.ZodIssue[]): z.ZodIssue[] {
  const flat: z.ZodIssue[] = [];
  for (const issue of issues) {
    if (issue.code === "invalid_union" && "unionErrors" in issue) {
      const unionErrors = (issue as unknown as { unionErrors: z.ZodError[] }).unionErrors;
      for (const subError of unionErrors) {
        flat.push(...flattenIssues(subError.issues));
      }
    } else {
      flat.push(issue);
    }
  }
  return flat;
}

/**
 * Validate a raw JSON object against the CaseBundle schema and seed constraints.
 *
 * @param data - Parsed JSON object from the request body.
 * @returns ValidationResult with detailed errors, warnings, and extracted fields.
 */
export function validateCaseBundle(data: unknown): ValidationResult {
  const result: ValidationResult = {
    valid: false,
    errors: [],
    warnings: [],
  };

  // 1. Schema-level validation (Zod)
  const parseResult = AcceptedCaseBundleSchema.safeParse(data);
  if (!parseResult.success) {
    const issues = flattenIssues(parseResult.error.issues);
    for (const issue of issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      const errMsg = `Schema violation at ${path}: ${issue.message}`;
      if (!result.errors.includes(errMsg)) {
        result.errors.push(errMsg);
      }
    }
    return result;
  }

  const bundle = parseResult.data;

  // 2. Seed constraint validation (mirrors crashlab-core SeedSchema)
  const payload = bundle.seed.payload;
  if (payload.length < SEED_CONSTRAINTS.minPayloadLength) {
    result.errors.push(
      `Seed payload too short: ${payload.length} bytes (minimum ${SEED_CONSTRAINTS.minPayloadLength})`
    );
  }
  if (payload.length > SEED_CONSTRAINTS.maxPayloadLength) {
    result.errors.push(
      `Seed payload too long: ${payload.length} bytes (maximum ${SEED_CONSTRAINTS.maxPayloadLength})`
    );
  }
  if (bundle.seed.id > SEED_CONSTRAINTS.maxId) {
    result.errors.push(
      `Seed ID exceeds safe integer range: ${bundle.seed.id}`
    );
  }

  // 3. Null-byte warning (known gap documented in crashlab-core)
  if (payload.includes(0)) {
    result.warnings.push(
      "Seed payload contains null bytes (0x00). Contracts interpreting payloads as C-style strings may be vulnerable to truncation or injection."
    );
  }

  // 4. Signature category validation
  const validCategories = [
    "auth",
    "budget",
    "state",
    "xdr",
    "runtime-failure", // legacy
  ];
  if (!validCategories.includes(bundle.signature.category)) {
    result.warnings.push(
      `Unknown signature category "${bundle.signature.category}". Expected one of: ${validCategories.join(", ")}.`
    );
  }

  // 5. Schema version tracking
  if ("schema" in bundle) {
    result.schemaVersion = bundle.schema;
  } else {
    result.warnings.push(
      "Legacy bundle detected (missing schema field). Consider re-exporting with the current crashlab-core version for full compatibility."
    );
  }

  // 6. Environment fingerprint validation (if present)
  if (bundle.environment) {
    result.environment = {
      os: bundle.environment.os,
      arch: bundle.environment.arch,
      family: bundle.environment.family,
      version: bundle.environment.version,
    };
  } else {
    result.environment = null;
    result.warnings.push(
      "No environment fingerprint present. Replay environment checks will be skipped."
    );
  }

  // 7. Populate extracted fields
  result.seed = {
    id: bundle.seed.id,
    payloadLength: payload.length,
  };
  result.signature = {
    category: bundle.signature.category,
    digest: bundle.signature.digest,
    signatureHash: bundle.signature.signature_hash,
  };

  // Final validity: valid only if no errors
  result.valid = result.errors.length === 0;
  return result;
}

/**
 * POST /api/artifacts/validate
 *
 * Accepts a JSON body containing a CaseBundle and returns a detailed validation report.
 *
 * Request body: { "bundle": <CaseBundle> }
 * Response: 200 OK with ValidationResult JSON
 *           400 Bad Request if body is not valid JSON or missing bundle field
 *           413 Payload Too Large if body exceeds 1 MiB
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Size guard: reject bodies > 1 MiB to prevent memory exhaustion
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > 1024 * 1024) {
      return NextResponse.json(
        {
          valid: false,
          errors: ["Request body exceeds 1 MiB limit."],
          warnings: [],
        },
        { status: 413 }
      );
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        valid: false,
        errors: ["Invalid JSON in request body."],
        warnings: [],
      },
      { status: 400 }
    );
  }

  // Expect { bundle: <CaseBundle> }
  if (!body || typeof body !== "object" || !("bundle" in body)) {
    return NextResponse.json(
      {
        valid: false,
        errors: ['Missing "bundle" field in request body.'],
        warnings: [],
      },
      { status: 400 }
    );
  }

  const bundle = (body as Record<string, unknown>).bundle;
  const result = validateCaseBundle(bundle);

  const status = result.valid ? 200 : 422;
  return NextResponse.json(result, { status });
}