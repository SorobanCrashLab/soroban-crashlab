import * as assert from "node:assert/strict";
import type { Report } from "./add-report-generator";
import {
  generateReportToken,
  storeReportForSharing,
  getReportByToken,
  generateShareableReportUrl,
  generateShareableReportLink,
  deleteReportByToken,
  listStoredReports,
  getReportStorageStats,
} from "./shareable-report-utils";

// Mock report for testing
const mockReport: Report = {
  generatedAt: new Date().toISOString(),
  filters: {
    dateRange: "last-7-days",
    severity: "all",
    area: "auth",
  },
  summary: {
    totalRuns: 100,
    totalCrashes: 5,
    averageDurationMs: 5000,
    mostFrequentArea: "auth",
    mostFrequentSeverity: "high",
  },
  data: [],
};

function testShareableReportUtils(): void {
  // Test 1: Generate unique tokens
  const token1 = generateReportToken();
  const token2 = generateReportToken();
  assert.ok(token1.length > 0, "Token should be generated");
  assert.ok(token2.length > 0, "Token should be generated");
  assert.notEqual(token1, token2, "Tokens should be unique");

  // Test 2: Store report and retrieve
  const token = storeReportForSharing(mockReport);
  const retrieved = getReportByToken(token);
  assert.ok(retrieved !== null, "Stored report should be retrievable");
  assert.equal(
    retrieved!.generatedAt,
    mockReport.generatedAt,
    "Report data should match"
  );

  // Test 3: Non-existent token returns null
  const nonExistent = getReportByToken("invalid-token-12345");
  assert.equal(nonExistent, null, "Non-existent token should return null");

  // Test 4: Generate shareable URL
  const baseUrl = "https://example.com";
  const url = generateShareableReportUrl(token, baseUrl);
  assert.ok(
    url.includes("/reports/shared/"),
    "URL should include reports endpoint"
  );
  assert.ok(url.includes(token), "URL should include token");

  // Test 5: Generate shareable link with all info
  const linkInfo = generateShareableReportLink(mockReport, baseUrl);
  assert.ok(linkInfo.token.length > 0, "Should have token");
  assert.ok(linkInfo.url.includes(baseUrl), "URL should include base URL");
  assert.ok(linkInfo.url.includes(linkInfo.token), "URL should include token");
  assert.ok(linkInfo.expiresIn.includes("7"), "Should expire in 7 days");

  // Test 6: Delete report
  const deleteToken = storeReportForSharing(mockReport);
  assert.ok(
    getReportByToken(deleteToken) !== null,
    "Report should exist before delete"
  );
  const deleted = deleteReportByToken(deleteToken);
  assert.ok(deleted, "Delete should return true");
  assert.equal(
    getReportByToken(deleteToken),
    null,
    "Report should not exist after delete"
  );

  // Test 7: List stored reports
  const token3 = storeReportForSharing(mockReport);
  const token4 = storeReportForSharing(mockReport);
  const reports = listStoredReports();
  assert.ok(
    reports.length >= 2,
    "Should have at least 2 stored reports"
  );
  assert.ok(
    reports.every((r) => r.token && r.createdAt && r.expiresAt),
    "Each report should have token, createdAt, and expiresAt"
  );

  // Test 8: Storage statistics
  const stats = getReportStorageStats();
  assert.ok(stats.totalReports > 0, "Should have reports in storage");
  assert.ok(
    stats.totalSizeEstimate.includes("MB"),
    "Size estimate should include MB"
  );

  // Clean up test tokens
  deleteReportByToken(token);
  deleteReportByToken(token3);
  deleteReportByToken(token4);
}

testShareableReportUtils();
console.log("shareable-report-utils.test.ts: all assertions passed");
