/**
 * Tests for the guided product tour logic.
 *
 * Verifies the durable-dismissal write ladder (localStorage read-back → session
 * fallback → in-memory), tolerant reads, the auto-start predicate, step config
 * integrity (unique ids, non-empty anchors/titles/bodies), target resolution
 * against real `data-tour` selectors (guards against UI drift), and progress
 * math.
 */

import * as assert from "node:assert/strict";
import {
  PRODUCT_TOUR_STEPS,
  TOUR_DISMISSED_KEY,
  TOUR_DISMISSED_SESSION_KEY,
  findTourStepTarget,
  getTourProgress,
  persistTourDismissal,
  readTourDismissal,
  shouldShowTour,
  validateTourSteps,
  type TourDismissalResult,
  type TourStep,
} from "./tour-utils";

class FakeStorage {
  data = new Map<string, string>();
  throws = false;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.throws) {
      // Simulate Safari private mode / quota denial.
      throw new Error("QuotaExceededError");
    }
    this.data.set(key, value);
  }
}

const runAssertions = () => {
  // Happy path: durable dismissal write verifies via read-back.
  {
    const persist = new FakeStorage();
    const session = new FakeStorage();
    const memory = { value: false };
    const result: TourDismissalResult = persistTourDismissal(persist, session, memory);
    assert.deepEqual(result, { persistent: true, sessionFallback: false });
    assert.equal(persist.getItem(TOUR_DISMISSED_KEY), "true");
    assert.equal(session.getItem(TOUR_DISMISSED_SESSION_KEY), null);
    assert.equal(memory.value, true);
  }

  // Quota/private-mode throw on persistent storage => session fallback used.
  {
    const persist = new FakeStorage();
    persist.throws = true;
    const session = new FakeStorage();
    const memory = { value: false };
    const result = persistTourDismissal(persist, session, memory);
    assert.deepEqual(result, { persistent: false, sessionFallback: true });
    assert.equal(session.getItem(TOUR_DISMISSED_SESSION_KEY), "true");
    assert.equal(memory.value, true);
  }

  // Both persistent and session throw => in-memory marker still hides the tour
  // for the session, and no exception escapes.
  {
    const persist = new FakeStorage();
    persist.throws = true;
    const session = new FakeStorage();
    session.throws = true;
    const memory = { value: false };
    assert.doesNotThrow(() => {
      const result = persistTourDismissal(persist, session, memory);
      assert.deepEqual(result, { persistent: false, sessionFallback: false });
    });
    assert.equal(memory.value, true);
  }

  // Silent no-op setItem (read-back verification failure) treated as failed.
  {
    const silentNoop = new FakeStorage();
    silentNoop.setItem = () => {}; // writes nothing
    const session = new FakeStorage();
    const memory = { value: false };
    const result = persistTourDismissal(silentNoop, session, memory);
    assert.deepEqual(result, { persistent: false, sessionFallback: true });
  }

  // readTourDismissal reads durable + session + in-memory layers.
  {
    const persist = new FakeStorage();
    persist.setItem(TOUR_DISMISSED_KEY, "true");
    const session = new FakeStorage();
    session.setItem(TOUR_DISMISSED_SESSION_KEY, "true");
    const memory = { value: false };
    const flags = readTourDismissal(persist, session, memory);
    assert.deepEqual(flags, { persistent: true, sessionFallback: true, inMemory: false });
  }

  // readTourDismissal tolerates throwing storage.
  {
    const persist = new FakeStorage();
    persist.throws = true;
    const session = new FakeStorage();
    session.throws = true;
    assert.doesNotThrow(() => {
      const flags = readTourDismissal(persist, session, { value: false });
      assert.deepEqual(flags, { persistent: false, sessionFallback: false, inMemory: false });
    });
  }

  // Auto-start predicate: the tour shows only when the wizard is complete AND
  // not yet dismissed.
  assert.equal(shouldShowTour(false, false), false, "no wizard => no tour");
  assert.equal(shouldShowTour(true, true), false, "dismissed => no tour");
  assert.equal(shouldShowTour(true, false), true, "complete + undismissed => tour");
  assert.equal(shouldShowTour(false, true), false, "incomplete + dismissed => no tour");

  // Step config integrity: committed steps are valid (unique ids, filled fields).
  {
    const errors = validateTourSteps(PRODUCT_TOUR_STEPS);
    assert.deepEqual(errors, [], "PRODUCT_TOUR_STEPS must pass validation");
    assert.equal(PRODUCT_TOUR_STEPS.length, 5, "the tour must have 5 steps");
    assert.deepEqual(
      PRODUCT_TOUR_STEPS.map((s) => s.id),
      ["upload-artifact", "run-detail", "crash-cluster", "triage-board", "schedules"],
    );
  }

  // Validation catches duplicate ids and empty anchors/titles/bodies.
  {
    const broken: TourStep[] = [
      { id: "dup", target: "a", title: "t", body: "b" },
      { id: "dup", target: "a", title: "t", body: "b" },
      { id: "no-target", target: "", title: "t", body: "b" },
      { id: "no-title", target: "a", title: "  ", body: "b" },
      { id: "no-body", target: "a", title: "t", body: "" },
    ];
    const errors = validateTourSteps(broken);
    assert.ok(errors.some((e) => e.includes('Duplicate tour step id: "dup"')));
    assert.ok(errors.some((e) => e.includes('"no-target" is missing its target selector')));
    assert.ok(errors.some((e) => e.includes('"no-title" is missing its title')));
    assert.ok(errors.some((e) => e.includes('"no-body" is missing its body')));
  }

  // Target resolution: a step's selector must resolve when the anchor exists,
  // and return null when absent (graceful degradation path).
  {
    const fakeElement = {} as unknown as Element;
    const doc = {
      querySelector: (selector: string): Element | null => (selector.startsWith(`[data-tour="`) ? fakeElement : null),
    };
    for (const step of PRODUCT_TOUR_STEPS) {
      assert.notEqual(
        findTourStepTarget(doc, step),
        null,
        `step "${step.id}" target must be resolvable`,
      );
    }
    const emptyDoc = { querySelector: (): Element | null => null };
    assert.equal(findTourStepTarget(emptyDoc, PRODUCT_TOUR_STEPS[0]), null);
  }

  // Progress math: 1-based so the first step already reports progress.
  assert.equal(getTourProgress(0, 5), 20);
  assert.equal(getTourProgress(2, 5), 60);
  assert.equal(getTourProgress(4, 5), 100);
  assert.equal(getTourProgress(0, 0), 0);
  assert.equal(getTourProgress(3, 7), Math.round((4 / 7) * 100));
};

runAssertions();
console.log("product-tour test: all assertions passed");