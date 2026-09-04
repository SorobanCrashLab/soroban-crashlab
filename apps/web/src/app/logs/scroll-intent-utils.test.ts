/**
 * Unit tests for scroll-intent-utils.ts
 * Issue #1352: Log viewer loses pinned scroll position when autoscroll races a new batch.
 */

import { describe, it, expect } from "vitest";
import { shouldFollow } from "./scroll-intent-utils";

describe("shouldFollow", () => {
  it("should NOT follow when user scrolled up manually", () => {
    expect(
      shouldFollow({
        distanceFromBottom: 10,
        scrolledUp: true,
        autoscroll: true,
      }),
    ).toBe(false);
  });

  it("should follow when user is within threshold of bottom, even with autoscroll OFF", () => {
    expect(
      shouldFollow({
        distanceFromBottom: 30,
        scrolledUp: false,
        autoscroll: false,
        threshold: 50,
      }),
    ).toBe(true);
  });

  it("should follow when autoscroll is ON and user has not scrolled up", () => {
    expect(
      shouldFollow({
        distanceFromBottom: 200,
        scrolledUp: false,
        autoscroll: true,
      }),
    ).toBe(true);
  });

  it("should NOT follow when autoscroll is OFF and user is NOT near bottom", () => {
    expect(
      shouldFollow({
        distanceFromBottom: 200,
        scrolledUp: false,
        autoscroll: false,
      }),
    ).toBe(false);
  });

  it("should use custom threshold when provided", () => {
    expect(
      shouldFollow({
        distanceFromBottom: 75,
        scrolledUp: false,
        autoscroll: false,
        threshold: 100,
      }),
    ).toBe(true);

    expect(
      shouldFollow({
        distanceFromBottom: 125,
        scrolledUp: false,
        autoscroll: false,
        threshold: 100,
      }),
    ).toBe(false);
  });

  it("should follow when at exact bottom (0px)", () => {
    expect(
      shouldFollow({
        distanceFromBottom: 0,
        scrolledUp: false,
        autoscroll: false,
      }),
    ).toBe(true);
  });

  it("should respect scrolledUp flag even at bottom", () => {
    expect(
      shouldFollow({
        distanceFromBottom: 0,
        scrolledUp: true,
        autoscroll: true,
      }),
    ).toBe(false);
  });
});
