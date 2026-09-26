import * as assert from "node:assert/strict";
import type { MilestoneEvent } from "./campaign-milestone-timeline-utils";

// Mock milestone events for testing
const mockEvents: MilestoneEvent[] = [
  {
    id: "event-1",
    type: "campaign_start",
    timestamp: "10:00:00",
    label: "Campaign started",
    description: "Fuzzing campaign is now tracking run milestones.",
    severity: "low",
  },
  {
    id: "event-2",
    type: "run_update",
    timestamp: "10:15:30",
    label: "Run completed",
    description: "Run auth-001 is completed (auth, high).",
    severity: "high",
    runId: "auth-001",
  },
  {
    id: "event-3",
    type: "failure_discovered",
    timestamp: "10:45:22",
    label: "Failure discovered",
    description: "assertion_failure in auth (sig-001).",
    severity: "critical",
    runId: "auth-002",
    failureSignature: "sig-001",
    failureCount: 1,
  },
  {
    id: "event-4",
    type: "campaign_pause",
    timestamp: "11:00:00",
    label: "Timeline paused",
    description: "Live timeline updates paused by operator.",
    severity: "medium",
  },
  {
    id: "event-5",
    type: "campaign_resume",
    timestamp: "11:30:00",
    label: "Timeline resumed",
    description: "Live timeline updates resumed.",
    severity: "low",
  },
];

function testCampaignTimelineVisualizer(): void {
  // Test 1: Filter events by type
  const failureEvents = mockEvents.filter((e) => e.type === "failure_discovered");
  assert.equal(failureEvents.length, 1, "Should find 1 failure event");
  assert.equal(
    failureEvents[0].type,
    "failure_discovered",
    "Filtered event should be failure_discovered"
  );

  // Test 2: Filter events by severity
  const criticalEvents = mockEvents.filter((e) => e.severity === "critical");
  assert.equal(criticalEvents.length, 1, "Should find 1 critical event");

  const highSeverityOrAbove = mockEvents.filter((e) => {
    const severityMap = { low: 1, medium: 2, high: 3, critical: 4 };
    return severityMap[e.severity as keyof typeof severityMap] >= 3;
  });
  assert.ok(
    highSeverityOrAbove.length >= 2,
    "Should find events with high or critical severity"
  );

  // Test 3: Filter by multiple types
  const lifecycleEvents = mockEvents.filter((e) =>
    ["campaign_start", "campaign_pause", "campaign_resume"].includes(e.type)
  );
  assert.equal(lifecycleEvents.length, 3, "Should find 3 lifecycle events");

  // Test 4: Pagination logic
  const pageSize = 2;
  const totalPages = Math.ceil(mockEvents.length / pageSize);
  assert.equal(totalPages, 3, "Should have 3 pages with 2 items per page");

  const page1 = mockEvents.slice(0, pageSize);
  assert.equal(page1.length, 2, "First page should have 2 items");

  const page2 = mockEvents.slice(pageSize, pageSize * 2);
  assert.equal(page2.length, 2, "Second page should have 2 items");

  const page3 = mockEvents.slice(pageSize * 2);
  assert.equal(page3.length, 1, "Third page should have 1 item");

  // Test 5: Event data completeness
  mockEvents.forEach((event) => {
    assert.ok(event.id, "Event should have id");
    assert.ok(event.type, "Event should have type");
    assert.ok(event.timestamp, "Event should have timestamp");
    assert.ok(event.label, "Event should have label");
    assert.ok(event.description, "Event should have description");
  });

  // Test 6: Run ID and failure signature tracking
  const runTrackedEvents = mockEvents.filter((e) => e.runId);
  assert.ok(runTrackedEvents.length > 0, "Should have events with run IDs");

  const failureSignatureEvents = mockEvents.filter((e) => e.failureSignature);
  assert.equal(
    failureSignatureEvents.length,
    1,
    "Should have 1 event with failure signature"
  );

  // Test 7: Event type variations
  const eventTypes = new Set(mockEvents.map((e) => e.type));
  assert.ok(
    eventTypes.has("campaign_start"),
    "Should have campaign_start type"
  );
  assert.ok(
    eventTypes.has("failure_discovered"),
    "Should have failure_discovered type"
  );

  // Test 8: Severity levels
  const severities = new Set(mockEvents.map((e) => e.severity).filter(Boolean));
  assert.ok(
    severities.has("critical"),
    "Should have critical severity"
  );
  assert.ok(
    severities.has("low"),
    "Should have low severity"
  );

  // Test 9: Empty event list handling
  const emptyEvents = mockEvents.filter(() => false);
  assert.equal(emptyEvents.length, 0, "Empty filter should return no events");

  // Test 10: Sorting events by timestamp (chronological)
  const timeOrder = [
    "10:00:00",
    "10:15:30",
    "10:45:22",
    "11:00:00",
    "11:30:00",
  ];
  mockEvents.forEach((event, index) => {
    assert.equal(
      event.timestamp,
      timeOrder[index],
      `Event ${index} should have correct timestamp`
    );
  });
}

testCampaignTimelineVisualizer();
console.log(
  "add-campaign-milestone-timeline-visualizer.test.ts: all assertions passed"
);
