import { createPrometheusMetricsExportDependencies } from "../../../../lib/integrations/prometheus-adapter";
import { PROMETHEUS_FETCH_TIMEOUT_MS } from "../../../../lib/timeouts";
import { successResponse } from "../../../../lib/api-response-utils";

/**
 * GET /api/health/metrics
 * Metrics Health Check.
 *
 * This route provides a real health check for the metrics system
 * using the Prometheus adapter to query the exporter health endpoint.
 * It replaces the mock implementation with actual health verification.
 */
export async function GET() {
  try {
    // Use environment variables or default configuration
    const prometheusEndpoint =
      process.env.PROMETHEUS_ENDPOINT || "http://localhost:9090";
    const prometheusHealthPath =
      process.env.PROMETHEUS_HEALTH_PATH || "/-/healthy";
    const timeoutMs = parseInt(process.env.PROMETHEUS_TIMEOUT_MS || String(PROMETHEUS_FETCH_TIMEOUT_MS), 10);

    // Create the Prometheus adapter with real configuration
    const adapter = createPrometheusMetricsExportDependencies({
      endpoint: prometheusEndpoint,
      healthPath: prometheusHealthPath,
      timeoutMs,
      enabled: true,
    });

    // Query the exporter health using the real adapter
    const healthResult = await adapter.queryExporterHealth(prometheusEndpoint);

    if (!healthResult.healthy || healthResult.statusCode >= 400) {
      return successResponse(
        {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          error: `Metrics exporter health check failed with status ${healthResult.statusCode}`,
          statusCode: healthResult.statusCode,
        },
        { status: 503 },
      );
    }

    return successResponse(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        endpoint: prometheusEndpoint,
        statusCode: healthResult.statusCode,
        version: "1.0.0",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error during metrics health check:", error);

    // Determine if this is a connection error or other error
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";
    const isConnectionError =
      errorMessage.includes("fetch") ||
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("timeout");

    return successResponse(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: errorMessage,
        errorType: isConnectionError ? "connection_error" : "internal_error",
      },
      { status: isConnectionError ? 503 : 500 },
    );
  }
}
