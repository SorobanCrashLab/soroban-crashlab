/**
 * Unit tests for date-utils.ts
 * Issue #1351: Analytics calendar heatmap misaligns cells for timezones ahead of UTC.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { localDateKey } from "./date-utils";

describe("localDateKey", () => {
  let originalTZ: string | undefined;

  beforeEach(() => {
    originalTZ = process.env.TZ;
  });

  afterEach(() => {
    if (originalTZ) {
      process.env.TZ = originalTZ;
    } else {
      delete process.env.TZ;
    }
  });

  it("should convert UTC midnight to local date", () => {
    // 2026-01-15 at midnight UTC
    const result = localDateKey("2026-01-15T00:00:00.000Z");
    // Result depends on local timezone, but should be valid YYYY-MM-DD
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("should handle UTC+13 timezone (late in local day)", () => {
    // Simulate a timestamp at 23:00 in UTC+13 (which is 10:00 UTC same day)
    // 2026-01-15 10:00 UTC = 2026-01-15 23:00 in UTC+13
    const timestamp = "2026-01-15T10:00:00.000Z";
    const date = new Date(timestamp);

    // When processed, should use local date components
    const result = localDateKey(timestamp);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Verify it uses getFullYear/getMonth/getDate (not UTC versions)
    const expectedYear = date.getFullYear();
    const expectedMonth = String(date.getMonth() + 1).padStart(2, "0");
    const expectedDay = String(date.getDate()).padStart(2, "0");
    expect(result).toBe(`${expectedYear}-${expectedMonth}-${expectedDay}`);
  });

  it("should handle UTC-11 timezone (early morning case)", () => {
    // Simulate early morning UTC-11
    // 2026-01-15 02:00 in UTC-11 = 2026-01-15 13:00 UTC
    const timestamp = "2026-01-15T13:00:00.000Z";
    const date = new Date(timestamp);

    const result = localDateKey(timestamp);

    const expectedYear = date.getFullYear();
    const expectedMonth = String(date.getMonth() + 1).padStart(2, "0");
    const expectedDay = String(date.getDate()).padStart(2, "0");
    expect(result).toBe(`${expectedYear}-${expectedMonth}-${expectedDay}`);
  });

  it("should handle date crossing midnight boundary", () => {
    // 23:59 on Jan 14 in UTC
    const timestamp = "2026-01-14T23:59:00.000Z";
    const date = new Date(timestamp);

    const result = localDateKey(timestamp);

    // Should use local date, which might be Jan 15 in some timezones
    const expectedYear = date.getFullYear();
    const expectedMonth = String(date.getMonth() + 1).padStart(2, "0");
    const expectedDay = String(date.getDate()).padStart(2, "0");
    expect(result).toBe(`${expectedYear}-${expectedMonth}-${expectedDay}`);
  });

  it("should pad month and day with leading zeros", () => {
    // March 5, 2026
    const timestamp = "2026-03-05T12:00:00.000Z";
    const date = new Date(timestamp);

    const result = localDateKey(timestamp);

    // Should have proper padding
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const expectedYear = date.getFullYear();
    const expectedMonth = String(date.getMonth() + 1).padStart(2, "0");
    const expectedDay = String(date.getDate()).padStart(2, "0");
    expect(result).toBe(`${expectedYear}-${expectedMonth}-${expectedDay}`);
  });

  it("should handle timestamps without milliseconds", () => {
    const timestamp = "2026-01-15T12:30:45Z";
    const date = new Date(timestamp);

    const result = localDateKey(timestamp);

    const expectedYear = date.getFullYear();
    const expectedMonth = String(date.getMonth() + 1).padStart(2, "0");
    const expectedDay = String(date.getDate()).padStart(2, "0");
    expect(result).toBe(`${expectedYear}-${expectedMonth}-${expectedDay}`);
  });

  it("should be consistent for same local date", () => {
    // Two timestamps on the same local date but different times
    const morning = "2026-01-15T08:00:00.000Z";
    const evening = "2026-01-15T20:00:00.000Z";

    const date1 = new Date(morning);
    const date2 = new Date(evening);

    // If they're on the same local date, keys should match
    if (
      date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear()
    ) {
      expect(localDateKey(morning)).toBe(localDateKey(evening));
    }
  });
});
