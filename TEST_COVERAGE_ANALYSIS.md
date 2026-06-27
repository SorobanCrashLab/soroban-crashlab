# Test Coverage Analysis: soroban-crashlab Repository

## Executive Summary
This document provides a comprehensive analysis of test coverage for:
1. Network configuration validation code
2. API proxy middleware (rate limiting)
3. Runs API endpoints
4. Artifacts API endpoints

---

## 1. Network Configuration Validation

### Implementation File
- **Main File**: [apps/web/src/app/network-config-utils.ts](apps/web/src/app/network-config-utils.ts)

### Test File
- **Test File**: [apps/web/src/app/network-config-utils.test.ts](apps/web/src/app/network-config-utils.test.ts) ✅ **Exists**

### Key Functions/Classes
```typescript
// Validation functions:
- validateNetworkUrl(raw: string, fieldName: string): string | null
- validateNetworkConfig(config: NetworkConfig): string | null
- validateNetworkStore(store: NetworkStore): string | null
- validateNetworkPassphrase(raw: string): string | null

// Core utilities:
- createDefaultNetworkStore(referenceTime?: Date): NetworkStore
- readNetworkStore(serialized: string | null, referenceTime?: Date): NetworkLoadResult
- serializeNetworkStore(store: NetworkStore): string
- addNetwork(store: NetworkStore, network: NetworkConfig): NetworkStore
- removeNetwork(store: NetworkStore, id: string): NetworkStore
- switchActiveNetwork(store: NetworkStore, id: string): NetworkStore
- findNetworkById(store: NetworkStore, id: string): NetworkConfig | undefined
```

### Test Framework
- **Framework**: Node.js `node:assert/strict` (no vitest/jest)
- **Test Runner Command**: `npx tsc src/app/network-config-utils.ts src/app/network-config-utils.test.ts --module commonjs --target es2020 --rootDir src --outDir build/test-tmp --esModuleInterop && node build/test-tmp/app/network-config-utils.test.js`

### Test Coverage Status
✅ **COMPREHENSIVE** - Tests cover:
- Default store shape and structure
- Round-trip serialization/deserialization
- Null input handling
- Invalid JSON input handling
- Built-in network merge logic
- URL validation (HTTPS requirements, localhost/127.0.0.1 exceptions, FTP rejection)
- Name validation (required, length limits, whitespace)
- Network passphrase validation
- Duplicate check logic
- Add/remove/switch operations

**Test Coverage**: ~95% of validation functions covered

---

## 2. API Proxy Middleware (Rate Limiting)

### Implementation File
- **Main File**: [apps/web/src/proxy.ts](apps/web/src/proxy.ts)

### Test File
- **Test File**: ❌ **Does NOT exist** - No corresponding test file

### Key Functions/Classes
```typescript
// Main middleware:
- proxy(request: NextRequest): NextResponse
  - Rate limiting logic with configurable window and max requests
  - Client key extraction from X-Forwarded-For, X-Real-IP headers
  - Bucket-based rate limiting algorithm
  - Response headers: RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset

// Helper functions:
- currentBucket(key: string, now: number): RateLimitBucket
- clientKey(request: NextRequest): string
- cleanupExpiredBuckets(now: number): void
- setRateLimitHeaders(response: NextResponse, remaining: number, resetAt: number, now: number): void
- readPositiveInteger(value: string | undefined, fallback: number): number
```

### Configuration
- **Rate Limit Window**: Configurable via `CRASHLAB_API_RATE_LIMIT_WINDOW_MS` (default: 60,000ms)
- **Max Requests**: Configurable via `CRASHLAB_API_RATE_LIMIT_MAX_REQUESTS` (default: 120)
- **Matcher**: `'/api/:path*'`

### Test Framework
- **Recommended**: Vitest (used elsewhere in project)

### Test Coverage Status
❌ **NOT TESTED** - Needs tests for:
- Rate limit bucket creation and tracking
- Rate limit enforcement (429 responses)
- Bucket expiration cleanup
- Client key extraction from various header combinations
- Rate limit response headers
- Default value fallbacks
- Edge cases (missing headers, cleanup intervals)

**Estimated Gap**: 100% of proxy middleware code needs tests

---

## 3. Runs API Endpoints

### Implementation Files

#### 3.1 GET /api/runs (List runs)
- **Main File**: [apps/web/src/app/api/runs/route.ts](apps/web/src/app/api/runs/route.ts)
- **Test File**: ❌ **Indirect test** - [apps/web/src/app/api/runs/runs-api.test.ts](apps/web/src/app/api/runs/runs-api.test.ts) ✅ **Exists**

#### 3.2 GET /api/runs/[id] (Get specific run)
- **Main File**: [apps/web/src/app/api/runs/[id]/route.ts](apps/web/src/app/api/runs/[id]/route.ts)
- **Test File**: ❌ **No direct test** - [apps/web/src/app/api/runs/get-run-by-id.test.ts](apps/web/src/app/api/runs/get-run-by-id.test.ts) ✅ **Tests underlying function**

#### 3.3 Sub-endpoints
- **Tags**: [apps/web/src/app/api/runs/[id]/tags/route.ts](apps/web/src/app/api/runs/[id]/tags/route.ts) (no test)
- **Issues**: [apps/web/src/app/api/runs/[id]/issues/route.ts](apps/web/src/app/api/runs/[id]/issues/route.ts) (no test)
- **Annotations**: [apps/web/src/app/api/runs/[id]/annotations/route.ts](apps/web/src/app/api/runs/[id]/annotations/route.ts) (no test)
- **Replay**: [apps/web/src/app/api/runs/[id]/replay/route.ts](apps/web/src/app/api/runs/[id]/replay/route.ts) ✅ **Has test**: [route.test.ts](apps/web/src/app/api/runs/[id]/replay/route.test.ts)

### Key Functions/Classes

#### In route.ts:
```typescript
export const GET = withRouteErrorHandling('GET /api/runs', async (request: Request) => {
  // Fetches from upstream API or returns mock data
})
```

#### In [id]/route.ts:
```typescript
export function findRunById(id: string): FuzzingRun | undefined {
  // Exported for unit testing - finds run by ID
}

export const GET = withRouteErrorHandling('GET /api/runs/[id]', async (...) => {
  // Handles upstream API or mock data
})
```

### Test Framework
- **Framework**: Node.js `node:assert/strict` for data validation tests
- **Test Runner**: Custom TypeScript compilation + Node execution

### Test Coverage Status

#### Currently Tested ✅
- `runs-api.test.ts`: Validates mock data structure and consistency
  - All runs have required fields
  - All run IDs are unique
  - Valid status/area/severity values
  - `findRunById()` function works correctly
  - Missing ID returns undefined

- `get-run-by-id.test.ts`: Validates individual run lookups
  - Known run IDs resolve correctly
  - Missing run returns undefined
  - All required fields present on runs
  - Failed runs contain `crashDetail` payload

#### Not Tested ❌
- **route.ts**: GET /api/runs endpoint HTTP layer
  - Upstream API integration with `NEXT_PUBLIC_API_URL`
  - Mock data fallback behavior
  - Error handling for failed upstream calls
  - Query parameter pass-through

- **[id]/route.ts**: GET /api/runs/[id] endpoint HTTP layer
  - Upstream API integration with `RUNS_API_URL`
  - Mock data fallback behavior
  - Error handling (4xx, 5xx responses)
  - Cache-Control header presence

- **[id]/tags/route.ts**: Tag persistence
- **[id]/issues/route.ts**: Issue linking
- **[id]/annotations/route.ts**: Annotation persistence

**Estimated Coverage**: ~20% (mock data validation only, no HTTP layer tests)

---

## 4. Artifacts API Endpoints

### Implementation Files

#### 4.1 GET /api/artifacts (List artifacts)
- **Main File**: [apps/web/src/app/api/artifacts/route.ts](apps/web/src/app/api/artifacts/route.ts)
- **Test File**: ❌ **No direct test**

#### 4.2 POST /api/artifacts (Upload artifact)
- **Implemented in**: [apps/web/src/app/api/artifacts/route.ts](apps/web/src/app/api/artifacts/route.ts)
- **Test File**: ❌ **No direct test**

#### 4.3 GET /api/artifacts/[id] (Download artifact)
- **Main File**: [apps/web/src/app/api/artifacts/[id]/route.ts](apps/web/src/app/api/artifacts/[id]/route.ts)
- **Test File**: ❌ **No direct test**

#### 4.4 DELETE /api/artifacts/[id] (Delete artifact)
- **Implemented in**: [apps/web/src/app/api/artifacts/[id]/route.ts](apps/web/src/app/api/artifacts/[id]/route.ts)
- **Test File**: ❌ **No direct test**

#### 4.5 POST /api/artifacts/validate (Validate case bundle)
- **Main File**: [apps/web/src/app/api/artifacts/validate/route.ts](apps/web/src/app/api/artifacts/validate/route.ts)
- **Test Files**: 
  - ✅ [route.test.ts](apps/web/src/app/api/artifacts/validate/route.test.ts) - Vitest unit tests
  - ✅ [route.integration.test.ts](apps/web/src/app/api/artifacts/validate/route.integration.test.ts) - Vitest integration tests

### Key Functions/Classes

#### In artifact-fs-adapter.ts (helper library):
```typescript
export interface ArtifactMetadata {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
}

// Core functions:
- getArtifactDir(): string
- sanitizeId(id: string): string
- getArtifactDirOrCreate(): Promise<string>
- listArtifactMetadata(): Promise<ArtifactMetadata[]>
- getArtifactById(id: string): Promise<{ metadata: ArtifactMetadata; buffer: Buffer } | null>
- deleteArtifactById(id: string): Promise<boolean>
- saveArtifact(name: string, buffer: Buffer): Promise<ArtifactMetadata>
```

#### In route-handler.ts (middleware utilities):
```typescript
export function jsonError(message: string, status: number): NextResponse
export async function readJsonBody(request: Request): Promise<{ body: unknown } | { error: NextResponse }>
export function withRouteErrorHandling<Args extends unknown[]>(
  routeLabel: string,
  handler: (...args: Args) => Promise<NextResponse>,
  fallbackMessage?: string
): (...args: Args) => Promise<NextResponse>
```

#### In validate/route.ts:
```typescript
export const CASE_BUNDLE_SCHEMA_VERSION = 2

export function validateCaseBundle(bundle: unknown): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  schemaVersion?: number;
  seed?: { id: number; payloadLength: number };
  signature?: { category: string; digest: number; signatureHash: number };
  environment?: EnvironmentFingerprint;
  failure_payload?: number[];
  rpc_envelope?: Record<string, unknown>;
}

export async function POST(request: NextRequest): Promise<NextResponse>
```

### Test Framework
- **Framework**: Vitest (`describe`, `it`, `expect`)
- **Test Runner**: `npx vitest run src/app/api/artifacts/validate/route.test.ts`

### Test Coverage Status

#### Validate Endpoint ✅
**COMPREHENSIVE TESTS EXIST**:
- `route.test.ts`: Zod schema validation unit tests
  - Valid versioned bundles (schema 2)
  - Legacy bundles (no schema field)
  - Bundles with environment fingerprint
  - Bundles with failure_payload
  - Bundles with rpc_envelope
  - Schema violations (missing seed, signature, wrong version)
  - Invalid field types
  - Negative seed IDs

- `route.integration.test.ts`: HTTP route integration tests
  - Valid bundle returns 200
  - Invalid JSON returns 400
  - Missing bundle field returns 400
  - Schema-invalid bundle returns 422
  - Oversized body returns 413
  - Edge cases for request handling

**Coverage**: ~90% of validation/validate endpoint

#### List Artifacts (GET /api/artifacts) ❌
**NOT TESTED** - Needs tests for:
- Listing artifacts from CRASHLAB_ARTIFACT_DIR
- Artifact metadata response format
- Error handling when directory doesn't exist
- Empty directory handling
- File system error handling

#### Upload Artifact (POST /api/artifacts) ❌
**NOT TESTED** - Needs tests for:
- File upload handling
- Form data parsing
- Multipart content-type handling
- Error when file is missing
- Directory creation if needed
- File system error handling

#### Download Artifact (GET /api/artifacts/[id]) ❌
**NOT TESTED** - Needs tests for:
- Retrieving artifact by ID from filesystem
- Path traversal protection (via `sanitizeId()`)
- File not found handling (404 response)
- Content-Type and Content-Disposition headers
- Stream/buffer handling
- File system error handling

#### Delete Artifact (DELETE /api/artifacts/[id]) ❌
**NOT TESTED** - Needs tests for:
- Deleting artifact by ID
- Path traversal protection
- File not found handling (404 response)
- Success response format
- File system error handling

#### Artifact FS Adapter ❌
**NOT TESTED** - Utility functions need tests for:
- `sanitizeId()` path traversal protection
- `getArtifactById()` file reading
- `deleteArtifactById()` file deletion
- `listArtifactMetadata()` directory listing
- `saveArtifact()` file writing
- `getArtifactDirOrCreate()` directory creation
- Error handling (ENOENT, EACCES, etc.)

**Estimated Coverage**: ~20% (validate endpoint only)

---

## Summary Table

| Component | Implementation | Tests | Framework | Coverage |
|-----------|---|---|---|---|
| **Network Config Validation** | ✅ Complete | ✅ Complete | Node assert | ~95% |
| **API Proxy Middleware** | ✅ Complete | ❌ Missing | - | 0% |
| **Runs API - List** | ✅ Complete | ⚠️ Partial* | Node assert | ~30% |
| **Runs API - Get by ID** | ✅ Complete | ⚠️ Partial* | Node assert | ~30% |
| **Runs API - Tags** | ✅ Complete | ❌ Missing | - | 0% |
| **Runs API - Issues** | ✅ Complete | ❌ Missing | - | 0% |
| **Runs API - Annotations** | ✅ Complete | ❌ Missing | - | 0% |
| **Runs API - Replay** | ✅ Complete | ✅ Complete | Vitest | ~80% |
| **Artifacts API - List** | ✅ Complete | ❌ Missing | - | 0% |
| **Artifacts API - Upload** | ✅ Complete | ❌ Missing | - | 0% |
| **Artifacts API - Download** | ✅ Complete | ❌ Missing | - | 0% |
| **Artifacts API - Delete** | ✅ Complete | ❌ Missing | - | 0% |
| **Artifacts API - Validate** | ✅ Complete | ✅ Complete | Vitest | ~90% |
| **Artifact FS Adapter** | ✅ Complete | ❌ Missing | - | 0% |
| **Route Handler Utils** | ✅ Complete | ❌ Missing | - | 0% |

*Partial: Only validates mock data structure, not HTTP routing

---

## Test Framework Status

### Test Runners in Use:
1. **Node.js assert/strict** (3 test files)
   - Used for: network-config, runs mock data validation
   - Runner: Manual TypeScript compilation + node execution
   - Location: `build/test-tmp/`

2. **Vitest** (8+ test files)
   - Used for: artifacts validate, integration tests
   - Runner: `npx vitest run`
   - Framework: `describe`, `it`, `expect` syntax

3. **Jest** (configured but not primary)
   - Config exists: [jest.config.js](apps/web/jest.config.js)
   - Status: Not actively used for new tests

4. **Playwright** (for E2E)
   - Config exists: [playwright.config.ts](apps/web/playwright.config.ts)
   - Used for: End-to-end testing

---

## Recommendations

### Priority 1 (High Impact, High Value)
1. **Add tests for API Proxy Middleware** (`proxy.ts`)
   - 0% coverage, affects all API requests
   - Framework: Vitest
   - Estimated effort: 1-2 hours

2. **Add tests for Artifact FS Adapter** (`artifact-fs-adapter.ts`)
   - 0% coverage, file system operations are critical
   - Framework: Vitest + fs mocking
   - Estimated effort: 2-3 hours

3. **Add HTTP-level tests for Runs API routes**
   - Validate upstream API integration
   - Framework: Vitest + Next.js testing utilities
   - Estimated effort: 3-4 hours

### Priority 2 (Medium Impact)
4. **Add HTTP-level tests for Artifacts CRUD endpoints**
   - GET /api/artifacts, POST, [id] GET/DELETE
   - Framework: Vitest
   - Estimated effort: 3-4 hours

5. **Add tests for Route Handler Utils** (`route-handler.ts`)
   - Error handling middleware
   - Framework: Vitest
   - Estimated effort: 1-2 hours

### Priority 3 (Lower Priority)
6. **Migrate test framework to unified Vitest**
   - Currently mixed between assert/strict and Vitest
   - Consolidate to Vitest for consistency
   - Effort: 1-2 hours refactoring

---

## Test Command Reference

```bash
# Current test commands in package.json (partial list):
npm run test:network-config  # Network config validation
npm run test:runs-api       # Runs API mock data validation
npm run test                # Runs all configured tests

# Vitest-based tests (explicit paths):
npx vitest run src/app/api/artifacts/validate/route.test.ts
npx vitest run src/app/api/artifacts/validate/route.integration.test.ts
```

---

## File Dependencies

### Import Graph:
```
proxy.ts
  └─ (standalone, uses Next.js only)

network-config-utils.ts
  └─ (standalone, no external deps)

route-handler.ts
  ├─ NextResponse (next/server)
  └─ logger.ts

artifact-fs-adapter.ts
  └─ fs/promises, path, os (Node.js)

/api/runs/route.ts
  ├─ NextResponse (next/server)
  ├─ logger (via route-handler)
  ├─ withRouteErrorHandling (route-handler.ts)
  └─ mockRuns.ts

/api/runs/[id]/route.ts
  ├─ NextResponse (next/server)
  ├─ mockRuns.ts
  ├─ withRouteErrorHandling (route-handler.ts)
  └─ types.ts

/api/artifacts/route.ts
  ├─ NextResponse (next/server)
  ├─ listArtifactMetadata (artifact-fs-adapter.ts)
  ├─ saveArtifact (artifact-fs-adapter.ts)
  ├─ jsonError (route-handler.ts)
  └─ withRouteErrorHandling (route-handler.ts)

/api/artifacts/[id]/route.ts
  ├─ NextResponse (next/server)
  ├─ getArtifactById (artifact-fs-adapter.ts)
  ├─ deleteArtifactById (artifact-fs-adapter.ts)
  ├─ jsonError (route-handler.ts)
  └─ withRouteErrorHandling (route-handler.ts)

/api/artifacts/validate/route.ts
  ├─ NextRequest, NextResponse (next/server)
  ├─ z (zod)
  └─ CaseBundle validation schemas
```

---

**Report Generated**: 2026-06-26  
**Workspace**: soroban-crashlab  
**Analysis Scope**: apps/web/src
