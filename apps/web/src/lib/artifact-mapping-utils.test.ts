import assert from "node:assert";
import {
  mapArtifactToDisplay,
  mapArtifactsToDisplay,
  inferCategoryFromName,
  formatBytes,
  groupArtifactsByCategory,
  filterArtifactsByDateRange,
  sortArtifacts,
  type ArtifactMapping,
} from "./artifact-mapping-utils";
import type { ArtifactMetadata } from "./artifact-fs-adapter";

function testMapArtifactToDisplay(): void {
  const metadata: ArtifactMetadata = {
    id: "test-id-123",
    name: "crash-log.txt",
    createdAt: "2026-06-01T10:00:00.000Z",
    sizeBytes: 2048,
  };

  const result = mapArtifactToDisplay(metadata);

  assert.equal(result.id, "test-id-123");
  assert.equal(result.displayName, "crash-log.txt");
  assert.equal(result.category, "logs");
  assert.equal(result.timestamp.toISOString(), "2026-06-01T10:00:00.000Z");
  assert.equal(result.size, 2048);
}

function testMapArtifactsToDisplay(): void {
  const metadata: ArtifactMetadata[] = [
    {
      id: "id-1",
      name: "data.json",
      createdAt: "2026-06-01T10:00:00.000Z",
      sizeBytes: 1024,
    },
    {
      id: "id-2",
      name: "screenshot.png",
      createdAt: "2026-06-01T11:00:00.000Z",
      sizeBytes: 4096,
    },
  ];

  const results = mapArtifactsToDisplay(metadata);

  assert.equal(results.length, 2);
  assert.equal(results[0].id, "id-1");
  assert.equal(results[0].category, "data");
  assert.equal(results[1].id, "id-2");
  assert.equal(results[1].category, "images");
}

function testInferCategoryFromName(): void {
  assert.equal(inferCategoryFromName("test.log"), "logs");
  assert.equal(inferCategoryFromName("debug.txt"), "logs");
  assert.equal(inferCategoryFromName("data.json"), "data");
  assert.equal(inferCategoryFromName("report.csv"), "data");
  assert.equal(inferCategoryFromName("schema.xml"), "data");
  assert.equal(inferCategoryFromName("screenshot.png"), "images");
  assert.equal(inferCategoryFromName("photo.jpg"), "images");
  assert.equal(inferCategoryFromName("image.jpeg"), "images");
  assert.equal(inferCategoryFromName("icon.gif"), "images");
  assert.equal(inferCategoryFromName("archive.zip"), "archives");
  assert.equal(inferCategoryFromName("backup.tar"), "archives");
  assert.equal(inferCategoryFromName("compressed.gz"), "archives");
  assert.equal(inferCategoryFromName("unknown.xyz"), "other");
  assert.equal(inferCategoryFromName("noextension"), "other");
}

function testFormatBytes(): void {
  assert.equal(formatBytes(0), "0 Bytes");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1048576), "1 MB");
  assert.equal(formatBytes(1073741824), "1 GB");
  assert.equal(formatBytes(512), "512 Bytes");
  assert.equal(formatBytes(2097152), "2 MB");
}

function testGroupArtifactsByCategory(): void {
  const artifacts: ArtifactMapping[] = [
    {
      id: "1",
      displayName: "test.log",
      category: "logs",
      timestamp: new Date("2026-06-01T10:00:00.000Z"),
      size: 1024,
    },
    {
      id: "2",
      displayName: "data.json",
      category: "data",
      timestamp: new Date("2026-06-01T11:00:00.000Z"),
      size: 2048,
    },
    {
      id: "3",
      displayName: "debug.log",
      category: "logs",
      timestamp: new Date("2026-06-01T12:00:00.000Z"),
      size: 512,
    },
  ];

  const grouped = groupArtifactsByCategory(artifacts);

  assert.equal(Object.keys(grouped).length, 2);
  assert.equal(grouped["logs"].length, 2);
  assert.equal(grouped["data"].length, 1);
  assert.equal(grouped["logs"][0].id, "1");
  assert.equal(grouped["logs"][1].id, "3");
  assert.equal(grouped["data"][0].id, "2");
}

function testFilterArtifactsByDateRange(): void {
  const artifacts: ArtifactMapping[] = [
    {
      id: "1",
      displayName: "old.log",
      category: "logs",
      timestamp: new Date("2026-05-01T10:00:00.000Z"),
      size: 1024,
    },
    {
      id: "2",
      displayName: "current.log",
      category: "logs",
      timestamp: new Date("2026-06-15T10:00:00.000Z"),
      size: 2048,
    },
    {
      id: "3",
      displayName: "future.log",
      category: "logs",
      timestamp: new Date("2026-07-01T10:00:00.000Z"),
      size: 512,
    },
  ];

  const startDate = new Date("2026-06-01T00:00:00.000Z");
  const endDate = new Date("2026-06-30T23:59:59.999Z");

  const filtered = filterArtifactsByDateRange(artifacts, startDate, endDate);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "2");
  assert.equal(filtered[0].displayName, "current.log");
}

function testSortArtifacts(): void {
  const artifacts: ArtifactMapping[] = [
    {
      id: "1",
      displayName: "b.log",
      category: "logs",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      size: 2048,
    },
    {
      id: "2",
      displayName: "a.log",
      category: "logs",
      timestamp: new Date("2026-06-01T10:00:00.000Z"),
      size: 1024,
    },
    {
      id: "3",
      displayName: "c.log",
      category: "logs",
      timestamp: new Date("2026-06-03T10:00:00.000Z"),
      size: 4096,
    },
  ];

  // Sort by size descending
  const sortedDesc = sortArtifacts(artifacts, "size", "desc");
  assert.equal(sortedDesc[0].id, "3");
  assert.equal(sortedDesc[1].id, "1");
  assert.equal(sortedDesc[2].id, "2");

  // Sort by size ascending
  const sortedAsc = sortArtifacts(artifacts, "size", "asc");
  assert.equal(sortedAsc[0].id, "2");
  assert.equal(sortedAsc[1].id, "1");
  assert.equal(sortedAsc[2].id, "3");

  // Sort by displayName ascending
  const sortedByName = sortArtifacts(artifacts, "displayName", "asc");
  assert.equal(sortedByName[0].displayName, "a.log");
  assert.equal(sortedByName[1].displayName, "b.log");
  assert.equal(sortedByName[2].displayName, "c.log");
}

function testEmptyArtifactsArray(): void {
  const empty: ArtifactMetadata[] = [];
  const result = mapArtifactsToDisplay(empty);
  assert.equal(result.length, 0);

  const grouped = groupArtifactsByCategory([]);
  assert.equal(Object.keys(grouped).length, 0);

  const sorted = sortArtifacts([], "size");
  assert.equal(sorted.length, 0);
}

// Run all tests
testMapArtifactToDisplay();
testMapArtifactsToDisplay();
testInferCategoryFromName();
testFormatBytes();
testGroupArtifactsByCategory();
testFilterArtifactsByDateRange();
testSortArtifacts();
testEmptyArtifactsArray();

console.log("artifact-mapping-utils.test.ts: all assertions passed");
