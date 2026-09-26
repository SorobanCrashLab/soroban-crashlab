import {
  validateGrafanaConfig,
  isApiTokenReachable,
  buildAnnotationPayload,
  joinGrafanaUrl,
  summariseAnnotations,
  formatAnnotationTimestamp,
  annotationStatusLabel,
  annotationStatusColour,
  runGrafanaAnnotationIntegrationFlow,
  GrafanaConfig,
  GrafanaAnnotation,
  GrafanaAnnotationDependencies,
} from "./integrate-grafana-dashboard-annotation-api-utils";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function makeConfig(overrides: Partial<GrafanaConfig> = {}): GrafanaConfig {
  return {
    baseUrl: "https://grafana.internal.crashlab.io",
    apiToken: "glsa_abcdefghijklmnop",
    dashboardUid: "crashlab-overview",
    defaultTags: ["fuzzing"],
    enabled: true,
    ...overrides,
  };
}

function makeAnnotation(overrides: Partial<GrafanaAnnotation> = {}): GrafanaAnnotation {
  return {
    id: "ann-1",
    runId: "run-abc123",
    text: "Run started",
    tags: ["soroban-crashlab", "run-abc123"],
    time: new Date().toISOString(),
    status: "sent",
    grafanaAnnotationId: 42,
    ...overrides,
  };
}

function testValidateGrafanaConfig_valid(): void {
  const r = validateGrafanaConfig(makeConfig());
  assert(r.isValid, "valid config should pass");
  assert(r.errors.length === 0, "valid config should have no errors");
  console.log("✓ testValidateGrafanaConfig_valid passed");
}

function testValidateGrafanaConfig_missingBaseUrl(): void {
  const r = validateGrafanaConfig(makeConfig({ baseUrl: "" }));
  assert(!r.isValid, "empty base URL should be invalid");
  assert(r.errors.includes("Grafana base URL is required"), "should flag missing base URL");
  console.log("✓ testValidateGrafanaConfig_missingBaseUrl passed");
}

function testValidateGrafanaConfig_invalidProtocol(): void {
  const r = validateGrafanaConfig(makeConfig({ baseUrl: "ftp://grafana/host" }));
  assert(!r.isValid, "non http/https base URL should be invalid");
  assert(
    r.errors.some((e) => e.includes("http:// or https://")),
    "should flag invalid protocol",
  );
  console.log("✓ testValidateGrafanaConfig_invalidProtocol passed");
}

function testValidateGrafanaConfig_missingToken(): void {
  const r = validateGrafanaConfig(makeConfig({ apiToken: "" }));
  assert(!r.isValid, "empty api token should be invalid");
  assert(r.errors.includes("API token is required"), "should flag missing token");
  console.log("✓ testValidateGrafanaConfig_missingToken passed");
}

function testValidateGrafanaConfig_shortToken(): void {
  const r = validateGrafanaConfig(makeConfig({ apiToken: "short" }));
  assert(!r.isValid, "short api token should be invalid");
  assert(
    r.errors.some((e) => e.includes("at least 10 characters")),
    "should flag short token",
  );
  console.log("✓ testValidateGrafanaConfig_shortToken passed");
}

function testIsApiTokenReachable(): void {
  assert(isApiTokenReachable("glsa_abcdefghijklmnop"), "long token should be reachable");
  assert(!isApiTokenReachable("short"), "short token should not be reachable");
  console.log("✓ testIsApiTokenReachable passed");
}

function testBuildAnnotationPayload(): void {
  const payload = buildAnnotationPayload({
    runId: "run-abc123",
    text: "Run completed",
    tags: ["nightly"],
    dashboardUid: "crashlab-overview",
    timeMs: 1000,
    timeEndMs: 2000,
  });

  assert(payload.time === 1000, "should set time");
  assert(payload.timeEnd === 2000, "should set timeEnd when provided");
  assert(payload.text === "Run completed", "should set text");
  assert(payload.dashboardUID === "crashlab-overview", "should set dashboardUID");
  const tags = payload.tags as string[];
  assert(tags.includes("soroban-crashlab"), "should include default tag");
  assert(tags.includes("run-abc123"), "should include runId as a tag");
  assert(tags.includes("nightly"), "should include custom tag");
  console.log("✓ testBuildAnnotationPayload passed");
}

function testBuildAnnotationPayload_noTimeEndOrDashboard(): void {
  const payload = buildAnnotationPayload({
    runId: "run-xyz",
    text: "Run started",
    timeMs: 500,
  });

  assert(!("timeEnd" in payload), "timeEnd should be omitted when not provided");
  assert(!("dashboardUID" in payload), "dashboardUID should be omitted when not provided");
  console.log("✓ testBuildAnnotationPayload_noTimeEndOrDashboard passed");
}

function testJoinGrafanaUrl(): void {
  assert(
    joinGrafanaUrl("https://grafana.example.com/", "/api/annotations") ===
      "https://grafana.example.com/api/annotations",
    "should join base with trailing slash and absolute path",
  );
  assert(
    joinGrafanaUrl("https://grafana.example.com", "api/annotations") ===
      "https://grafana.example.com/api/annotations",
    "should join base without trailing slash and relative path",
  );
  console.log("✓ testJoinGrafanaUrl passed");
}

function testSummariseAnnotations(): void {
  const summary = summariseAnnotations([
    makeAnnotation({ status: "sent" }),
    makeAnnotation({ status: "pending" }),
    makeAnnotation({ status: "failed" }),
    makeAnnotation({ status: "sent" }),
  ]);
  assert(summary.total === 4, "total should count all annotations");
  assert(summary.sent === 2, "sent count should be correct");
  assert(summary.pending === 1, "pending count should be correct");
  assert(summary.failed === 1, "failed count should be correct");
  console.log("✓ testSummariseAnnotations passed");
}

function testFormatAnnotationTimestamp(): void {
  assert(
    formatAnnotationTimestamp("not-a-date") === "not-a-date",
    "invalid date should return original string",
  );
  const formatted = formatAnnotationTimestamp(new Date(2024, 0, 1).toISOString());
  assert(typeof formatted === "string" && formatted.length > 0, "valid date should format to a string");
  console.log("✓ testFormatAnnotationTimestamp passed");
}

function testAnnotationStatusLabelAndColour(): void {
  assert(annotationStatusLabel("sent") === "Sent", "sent label should match");
  assert(annotationStatusLabel("pending") === "Pending", "pending label should match");
  assert(annotationStatusLabel("failed") === "Failed", "failed label should match");
  assert(annotationStatusColour("sent") === "green", "sent colour should be green");
  assert(annotationStatusColour("pending") === "yellow", "pending colour should be yellow");
  assert(annotationStatusColour("failed") === "red", "failed colour should be red");
  console.log("✓ testAnnotationStatusLabelAndColour passed");
}

function makeDeps(overrides: Partial<GrafanaAnnotationDependencies> = {}): GrafanaAnnotationDependencies {
  return {
    async resolveConfig() {
      return makeConfig();
    },
    async queryHealth() {
      return { healthy: true, statusCode: 200 };
    },
    async createAnnotation() {
      return { accepted: true, annotationId: 7 };
    },
    ...overrides,
  };
}

async function testRunGrafanaAnnotationIntegrationFlow_successPath(): Promise<void> {
  const result = await runGrafanaAnnotationIntegrationFlow(makeDeps());
  assert(result.success, "integration flow should succeed");
  assert(result.steps.length === 4, "all deterministic boundary steps should be reported");
  assert(result.steps.every((step) => step.status === "passed"), "all steps should pass");
  assert(result.annotationId === 7, "annotation id should be surfaced");
  console.log("✓ testRunGrafanaAnnotationIntegrationFlow_successPath passed");
}

async function testRunGrafanaAnnotationIntegrationFlow_configUnavailable(): Promise<void> {
  const result = await runGrafanaAnnotationIntegrationFlow(
    makeDeps({
      async resolveConfig() {
        return null;
      },
    }),
  );
  assert(!result.success, "flow should fail when config cannot be resolved");
  assert(
    result.steps.some((step) => step.id === "config-resolve" && step.status === "failed"),
    "config resolve should fail",
  );
  console.log("✓ testRunGrafanaAnnotationIntegrationFlow_configUnavailable passed");
}

async function testRunGrafanaAnnotationIntegrationFlow_invalidConfig(): Promise<void> {
  const result = await runGrafanaAnnotationIntegrationFlow(
    makeDeps({
      async resolveConfig() {
        return makeConfig({ apiToken: "" });
      },
    }),
  );
  assert(!result.success, "flow should fail when config is invalid");
  assert(
    result.steps.some((step) => step.id === "config-validate" && step.status === "failed"),
    "config validate should fail",
  );
  console.log("✓ testRunGrafanaAnnotationIntegrationFlow_invalidConfig passed");
}

async function testRunGrafanaAnnotationIntegrationFlow_healthFailure(): Promise<void> {
  const result = await runGrafanaAnnotationIntegrationFlow(
    makeDeps({
      async queryHealth() {
        return { healthy: false, statusCode: 503 };
      },
    }),
  );
  assert(!result.success, "flow should fail on downstream health failure");
  assert(
    result.steps.some((step) => step.id === "health-query" && step.status === "failed"),
    "health verification step should fail",
  );
  console.log("✓ testRunGrafanaAnnotationIntegrationFlow_healthFailure passed");
}

async function testRunGrafanaAnnotationIntegrationFlow_annotationRejected(): Promise<void> {
  const result = await runGrafanaAnnotationIntegrationFlow(
    makeDeps({
      async createAnnotation() {
        return { accepted: false };
      },
    }),
  );
  assert(!result.success, "flow should fail when annotation creation is rejected");
  assert(
    result.steps.some((step) => step.id === "annotation-create" && step.status === "failed"),
    "annotation create step should fail",
  );
  console.log("✓ testRunGrafanaAnnotationIntegrationFlow_annotationRejected passed");
}

async function runAllTests(): Promise<void> {
  console.log("Running Grafana Dashboard Annotation API Utils Tests...\\n");
  try {
    testValidateGrafanaConfig_valid();
    testValidateGrafanaConfig_missingBaseUrl();
    testValidateGrafanaConfig_invalidProtocol();
    testValidateGrafanaConfig_missingToken();
    testValidateGrafanaConfig_shortToken();
    testIsApiTokenReachable();
    testBuildAnnotationPayload();
    testBuildAnnotationPayload_noTimeEndOrDashboard();
    testJoinGrafanaUrl();
    testSummariseAnnotations();
    testFormatAnnotationTimestamp();
    testAnnotationStatusLabelAndColour();
    await testRunGrafanaAnnotationIntegrationFlow_successPath();
    await testRunGrafanaAnnotationIntegrationFlow_configUnavailable();
    await testRunGrafanaAnnotationIntegrationFlow_invalidConfig();
    await testRunGrafanaAnnotationIntegrationFlow_healthFailure();
    await testRunGrafanaAnnotationIntegrationFlow_annotationRejected();
    console.log("\\n✅ All Grafana Dashboard Annotation API utils tests passed!");
  } catch (error) {
    console.error("\\n❌ Test failed:", error);
    process.exit(1);
  }
}

if (typeof require !== "undefined" && require.main === module) {
  void runAllTests();
}
