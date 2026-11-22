# Manual Test Steps for /api/health/metrics Endpoint

This document provides step-by-step instructions to manually test the `/api/health/metrics` endpoint implementation for ROADMAP-108.

## Prerequisites

1. Ensure you have Node.js 22+ and npm 10+ installed
2. Install dependencies: `npm ci`
3. Start the development server: `npm run dev`

## Test Environment Setup

The endpoint uses environment variables for configuration. Set these before testing:

```bash
# Optional: Set custom Prometheus endpoint (defaults to http://localhost:9090)
export PROMETHEUS_ENDPOINT="http://localhost:9090"

# Optional: Set custom health path (defaults to /-/healthy)
export PROMETHEUS_HEALTH_PATH="/-/healthy"

# Optional: Set timeout in milliseconds (defaults to 5000)
export PROMETHEUS_TIMEOUT_MS="5000"
```

## Manual Test Steps

### Test 1: Healthy Endpoint Response

**Objective:** Verify the endpoint returns a healthy status when Prometheus is accessible.

1. Start the development server:
   ```bash
   cd apps/web
   npm run dev
   ```

2. In a browser or using curl, access:
   ```
   http://localhost:3000/api/health/metrics
   ```

3. **Expected Response (200 OK):**
   ```json
   {
     "status": "healthy",
     "timestamp": "2024-05-31T14:30:00.000Z",
     "endpoint": "http://localhost:9090",
     "statusCode": 200,
     "version": "1.0.0"
   }
   ```

4. **Verification:**
   - Status code is 200
   - `status` field is "healthy"
   - `statusCode` matches the HTTP response
   - `timestamp` is a valid ISO 8601 date
   - `endpoint` matches the configured Prometheus endpoint

### Test 2: Unhealthy Endpoint Response

**Objective:** Verify the endpoint returns an unhealthy status when Prometheus is unavailable.

1. Set an invalid Prometheus endpoint:
   ```bash
   export PROMETHEUS_ENDPOINT="http://localhost:9999"
   ```

2. Restart the development server to pick up the new environment variable

3. Access the endpoint:
   ```
   http://localhost:3000/api/health/metrics
   ```

4. **Expected Response (503 Service Unavailable):**
   ```json
   {
     "status": "unhealthy",
     "timestamp": "2024-05-31T14:30:00.000Z",
     "error": "Metrics exporter health check failed with status 503",
     "statusCode": 503
   }
   ```

5. **Verification:**
   - Status code is 503
   - `status` field is "unhealthy"
   - Error message describes the failure
   - `statusCode` matches the HTTP response

### Test 3: Connection Error Handling

**Objective:** Verify the endpoint handles connection errors gracefully.

1. Set an unreachable endpoint:
   ```bash
   export PROMETHEUS_ENDPOINT="http://nonexistent.example.com:9090"
   ```

2. Restart the development server

3. Access the endpoint:
   ```
   http://localhost:3000/api/health/metrics
   ```

4. **Expected Response (503 Service Unavailable):**
   ```json
   {
     "status": "error",
     "timestamp": "2024-05-31T14:30:00.000Z",
     "error": "fetch failed",
     "errorType": "connection_error"
   }
   ```

5. **Verification:**
   - Status code is 503
   - `status` field is "error"
   - `errorType` is "connection_error"
   - Error message provides diagnostic information

### Test 4: Timeout Handling

**Objective:** Verify the endpoint respects the timeout configuration.

1. Set a very short timeout:
   ```bash
   export PROMETHEUS_TIMEOUT_MS="100"
   export PROMETHEUS_ENDPOINT="http://slow-server.example.com:9090"
   ```

2. Restart the development server

3. Access the endpoint:
   ```
   http://localhost:3000/api/health/metrics
   ```

4. **Expected Response (503 Service Unavailable):**
   ```json
   {
     "status": "error",
     "timestamp": "2024-05-31T14:30:00.000Z",
     "error": "The operation was aborted",
     "errorType": "connection_error"
   }
   ```

5. **Verification:**
   - Request fails within the configured timeout
   - Error type indicates connection/timeout issue
   - Response is returned quickly (within timeout + overhead)

## Automated Test Verification

Run the unit tests to verify the implementation:

```bash
cd apps/web

# Test the metrics utils
npx tsc src/app/integrate-metrics-export-to-prometheus-utils.ts src/app/integrate-metrics-export-to-prometheus-utils.test.ts src/lib/integrations/prometheus-adapter.ts --module commonjs --target es2020 --rootDir src --outDir build/test-tmp --esModuleInterop
node build/test-tmp/app/integrate-metrics-export-to-prometheus-utils.test.js

# Test the health metrics endpoint
npx tsc src/app/api/health/metrics/route.test.ts src/lib/integrations/prometheus-adapter.ts --module commonjs --target es2020 --rootDir src --outDir build/test-tmp --esModuleInterop --skipLibCheck
node build/test-tmp/app/api/health/metrics/route.test.js
```

**Expected Output:**
- All tests should pass with "✅" indicators
- No assertion failures or errors

## Integration Test with Real Prometheus

For a complete integration test:

1. Start a local Prometheus instance:
   ```bash
   docker run -p 9090:9090 prom/prometheus
   ```

2. Configure the endpoint to use the local instance:
   ```bash
   export PROMETHEUS_ENDPOINT="http://localhost:9090"
   ```

3. Restart the development server

4. Access the health endpoint and verify it returns "healthy" status

5. Stop Prometheus and verify the endpoint returns "unhealthy" status

## Test Checklist

- [ ] Endpoint returns 200 with healthy status when Prometheus is accessible
- [ ] Endpoint returns 503 with unhealthy status when Prometheus returns error
- [ ] Endpoint returns 503 with connection error when Prometheus is unreachable
- [ ] Endpoint respects timeout configuration
- [ ] Response includes all required fields (status, timestamp, endpoint, statusCode, version)
- [ ] Error responses include diagnostic information (error, errorType)
- [ ] Unit tests pass for metrics utils
- [ ] Unit tests pass for health metrics endpoint
- [ ] Integration test with real Prometheus works correctly

## Troubleshooting

**Issue:** Build fails with TypeScript errors
- **Solution:** The build may fail due to pre-existing TypeScript errors in other files. Focus on testing the specific files related to this implementation using the isolated test commands above.

**Issue:** Tests fail with module not found errors
- **Solution:** Ensure you're running tests from the `apps/web` directory and that dependencies are installed with `npm ci`.

**Issue:** Endpoint returns 500 instead of expected error codes
- **Solution:** Check the server logs for detailed error messages. Verify environment variables are set correctly before starting the dev server.

## Summary

This implementation successfully:
- ✅ Implements a real adapter using the Prometheus adapter instead of mocks
- ✅ Removes mock timers and uses real timeout handling
- ✅ Updates utils tests with health check functionality
- ✅ Provides comprehensive error handling and diagnostics
- ✅ Follows existing code patterns and conventions
