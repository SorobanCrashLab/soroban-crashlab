import { formatSize, formatDate, generatePreviewContent, Artifact } from "./implement-artifact-preview-modal-component";

// Test utilities
function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: `art-${Math.random().toString(36).substr(2, 9)}`,
    name: "test-artifact.bin",
    type: "seed",
    size: 1024,
    updatedAt: "2026-04-23T10:00:00Z",
    runId: "run-1000",
    content_hash: "a1b2c3d4",
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test: formatSize utility function
function testFormatSize(): void {
  assert(formatSize(0) === "0 B", "Zero bytes should format correctly");
  assert(formatSize(512) === "512 B", "Bytes under 1KB should format correctly");
  assert(formatSize(1024) === "1.0 KB", "Exactly 1KB should format correctly");
  assert(formatSize(2048) === "2.0 KB", "2KB should format correctly");
  assert(formatSize(1536) === "1.5 KB", "1.5KB should format correctly");
  assert(formatSize(1024 * 1024) === "1.0 MB", "Exactly 1MB should format correctly");
  assert(formatSize(1572864) === "1.5 MB", "1.5MB should format correctly");
  assert(formatSize(1024 * 1024 * 2.5) === "2.5 MB", "2.5MB should format correctly");
  
  console.log("✓ testFormatSize passed");
}

// Test: formatDate utility function
function testFormatDate(): void {
  const validIso = "2026-04-23T10:30:00Z";
  const formatted = formatDate(validIso);
  
  // Should return a formatted date string, not the original ISO string
  assert(formatted !== validIso, "Valid ISO date should be formatted");
  assert(formatted.length > 0, "Formatted date should not be empty");
  
  // Test invalid date fallback
  const invalidIso = "invalid-date";
  const fallback = formatDate(invalidIso);
  assert(fallback === invalidIso, "Invalid date should return original string");
  
  console.log("✓ testFormatDate passed");
}

// Test: generatePreviewContent for seed artifacts
function testGeneratePreviewContentSeed(): void {
  const seedArtifact = makeArtifact({
    id: "seed-test-123",
    type: "seed",
    name: "test-seed.bin",
  });
  
  const content = generatePreviewContent(seedArtifact);
  
  assert(content.length > 0, "Seed preview should generate content");
  assert(content.includes("00000000"), "Seed preview should include hex addresses");
  assert(content.includes("|"), "Seed preview should include ASCII column separators");
  
  // Should be deterministic - same input produces same output
  const content2 = generatePreviewContent(seedArtifact);
  assert(content === content2, "Seed preview should be deterministic");
  
  console.log("✓ testGeneratePreviewContentSeed passed");
}

// Test: generatePreviewContent for log artifacts
function testGeneratePreviewContentLog(): void {
  const logArtifact = makeArtifact({
    id: "log-test-456",
    type: "log",
    name: "fuzzer.log",
  });
  
  const content = generatePreviewContent(logArtifact);
  
  assert(content.length > 0, "Log preview should generate content");
  assert(content.includes("[INFO]") || content.includes("[DEBUG]") || content.includes("[WARN]") || content.includes("[ERROR]"), "Log preview should include log levels");
  assert(content.includes("T") && content.includes("Z"), "Log preview should include ISO timestamps");
  
  // Should contain multiple lines
  const lines = content.split("\n");
  assert(lines.length > 1, "Log preview should contain multiple lines");
  
  console.log("✓ testGeneratePreviewContentLog passed");
}

// Test: generatePreviewContent for trace artifacts
function testGeneratePreviewContentTrace(): void {
  const traceArtifact = makeArtifact({
    id: "trace-test-789",
    type: "trace",
    name: "execution.json",
  });
  
  const content = generatePreviewContent(traceArtifact);
  
  assert(content.length > 0, "Trace preview should generate content");
  
  // Should be valid JSON
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    assert(false, "Trace preview should be valid JSON");
  }
  
  assert(parsed.artifact_id === traceArtifact.id, "Trace preview should include artifact ID");
  assert(Array.isArray(parsed.execution_steps), "Trace preview should include execution steps");
  assert(parsed.execution_steps.length > 0, "Trace preview should have at least one execution step");
  
  console.log("✓ testGeneratePreviewContentTrace passed");
}

// Test: generatePreviewContent for coverage artifacts
function testGeneratePreviewContentCoverage(): void {
  const coverageArtifact = makeArtifact({
    id: "coverage-test-abc",
    type: "coverage",
    name: "coverage-report.txt",
  });
  
  const content = generatePreviewContent(coverageArtifact);
  
  assert(content.length > 0, "Coverage preview should generate content");
  assert(content.includes("Coverage Report"), "Coverage preview should include report header");
  assert(content.includes("Lines"), "Coverage preview should include line coverage");
  assert(content.includes("Branches"), "Coverage preview should include branch coverage");
  assert(content.includes("Functions"), "Coverage preview should include function coverage");
  assert(content.includes("%"), "Coverage preview should include percentage values");
  
  console.log("✓ testGeneratePreviewContentCoverage passed");
}

// Test: generatePreviewContent for bundle artifacts
function testGeneratePreviewContentBundle(): void {
  const bundleArtifact = makeArtifact({
    id: "bundle-test-def",
    type: "bundle",
    name: "archive.tar.gz",
  });
  
  const content = generatePreviewContent(bundleArtifact);
  
  assert(content.length > 0, "Bundle preview should generate content");
  assert(content.includes("00000000"), "Bundle preview should include hex addresses (like seed)");
  assert(content.includes("|"), "Bundle preview should include ASCII column separators");
  
  console.log("✓ testGeneratePreviewContentBundle passed");
}

// Test: generatePreviewContent deterministic behavior
function testGeneratePreviewContentDeterministic(): void {
  const artifact1 = makeArtifact({ id: "deterministic-test", type: "log" });
  const artifact2 = makeArtifact({ id: "deterministic-test", type: "log" });
  
  const content1 = generatePreviewContent(artifact1);
  const content2 = generatePreviewContent(artifact2);
  
  assert(content1 === content2, "Same artifact ID should produce identical content");
  
  // Different IDs should produce different content
  const artifact3 = makeArtifact({ id: "different-test", type: "log" });
  const content3 = generatePreviewContent(artifact3);
  
  assert(content1 !== content3, "Different artifact IDs should produce different content");
  
  console.log("✓ testGeneratePreviewContentDeterministic passed");
}

// Test: Edge cases for generatePreviewContent
function testGeneratePreviewContentEdgeCases(): void {
  // Empty ID
  const emptyIdArtifact = makeArtifact({ id: "", type: "seed" });
  const emptyContent = generatePreviewContent(emptyIdArtifact);
  assert(emptyContent.length >= 0, "Empty ID should not crash preview generation");
  
  // Very short ID
  const shortIdArtifact = makeArtifact({ id: "a", type: "log" });
  const shortContent = generatePreviewContent(shortIdArtifact);
  assert(shortContent.length > 0, "Short ID should still generate content");
  
  // Very long ID
  const longId = "a".repeat(100);
  const longIdArtifact = makeArtifact({ id: longId, type: "trace" });
  const longContent = generatePreviewContent(longIdArtifact);
  assert(longContent.length > 0, "Long ID should generate content");
  
  // Special characters in ID
  const specialIdArtifact = makeArtifact({ id: "test-123_$%^", type: "coverage" });
  const specialContent = generatePreviewContent(specialIdArtifact);
  assert(specialContent.length > 0, "Special characters in ID should not break generation");
  
  console.log("✓ testGeneratePreviewContentEdgeCases passed");
}

// Test: Artifact interface validation
function testArtifactInterface(): void {
  const artifact = makeArtifact({
    id: "interface-test",
    name: "test.bin",
    type: "seed",
    size: 2048,
    updatedAt: "2026-04-23T15:30:00Z",
    runId: "run-123",
    content_hash: "abc123def",
  });
  
  // Verify all required fields are present
  assert(typeof artifact.id === "string", "Artifact ID should be string");
  assert(typeof artifact.name === "string", "Artifact name should be string");
  assert(["seed", "log", "trace", "coverage", "bundle"].includes(artifact.type), "Artifact type should be valid");
  assert(typeof artifact.size === "number", "Artifact size should be number");
  assert(typeof artifact.updatedAt === "string", "Artifact updatedAt should be string");
  
  // Verify optional fields
  assert(typeof artifact.runId === "string" || artifact.runId === undefined, "Artifact runId should be string or undefined");
  assert(typeof artifact.content_hash === "string" || artifact.content_hash === undefined, "Artifact content_hash should be string or undefined");
  
  console.log("✓ testArtifactInterface passed");
}

// Test: Large artifact size formatting
function testFormatSizeLarge(): void {
  const gigabyte = 1024 * 1024 * 1024;
  
  // Test very large sizes (should still work with MB formatting)
  assert(formatSize(gigabyte) === "1024.0 MB", "1GB should format as 1024.0 MB");
  assert(formatSize(gigabyte * 2.5) === "2560.0 MB", "2.5GB should format as 2560.0 MB");
  
  // Test edge case: exactly at MB boundary
  const exactMB = 1024 * 1024;
  assert(formatSize(exactMB) === "1.0 MB", "Exactly 1MB should format correctly");
  assert(formatSize(exactMB - 1) === "1024.0 KB", "Just under 1MB should format as KB");
  
  console.log("✓ testFormatSizeLarge passed");
}

// Test: Date formatting edge cases
function testFormatDateEdgeCases(): void {
  // Test various valid ISO formats
  const formats = [
    "2026-04-23T10:30:00Z",
    "2026-04-23T10:30:00.000Z",
    "2026-04-23T10:30:00+00:00",
    "2026-12-31T23:59:59Z",
  ];
  
  formats.forEach(format => {
    const result = formatDate(format);
    assert(result !== format, `Format ${format} should be transformed`);
    assert(result.length > 0, `Format ${format} should produce non-empty result`);
  });
  
  // Test invalid formats
  const invalidFormats = [
    "",
    "not-a-date",
    "2026-13-45T25:70:70Z", // Invalid date components
    "2026-04-23", // Missing time
  ];
  
  invalidFormats.forEach(format => {
    const result = formatDate(format);
    assert(result === format, `Invalid format ${format} should return original string`);
  });
  
  console.log("✓ testFormatDateEdgeCases passed");
}

// Run all tests
function runAllTests(): void {
  console.log("Running Artifact Preview Modal Component Tests...\n");
  
  try {
    testFormatSize();
    testFormatDate();
    testGeneratePreviewContentSeed();
    testGeneratePreviewContentLog();
    testGeneratePreviewContentTrace();
    testGeneratePreviewContentCoverage();
    testGeneratePreviewContentBundle();
    testGeneratePreviewContentDeterministic();
    testGeneratePreviewContentEdgeCases();
    testArtifactInterface();
    testFormatSizeLarge();
    testFormatDateEdgeCases();
    
    console.log("\n✅ All Artifact Preview Modal Component tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Export for external test runners
export {
  formatSize,
  formatDate,
  generatePreviewContent,
  makeArtifact,
  runAllTests,
};

// Run tests if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}