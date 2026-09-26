/**
 * Guided product tour — step definitions and pure tour logic.
 *
 * The tour walks a first-time visitor (wizard completed, tour not yet
 * dismissed) through the upload → run → cluster → triage → schedules loop,
 * spotlighting anchors on the dashboard. Target selectors are the value of a
 * `data-tour` attribute so drift in class names / copy does not silently break
 * the spotlight; a unit test and the e2e spec both verify each step's target
 * still resolves.
 */

// ── Storage keys ──────────────────────────────────────────────────────────────

/** Durable, cross-session "show the tour once" flag. */
export const TOUR_DISMISSED_KEY = 'crashlab:product-tour-dismissed:v1';
/** Same-session fallback when the durable dismissal write fails (private mode). */
export const TOUR_DISMISSED_SESSION_KEY = 'crashlab:product-tour-dismissed-session:v1';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TourStep {
  /** Unique step id (used for keys/assertions). */
  id: string;
  /** Value of the `data-tour` attribute the spotlight anchors to. */
  target: string;
  title: string;
  body: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface TourDismissalResult {
  /** Dismissal persisted across sessions via localStorage (durable). */
  persistent: boolean;
  /** Same-session fallback marker via sessionStorage. */
  sessionFallback: boolean;
}

// ── Steps ────────────────────────────────────────────────────────────────────

export const PRODUCT_TOUR_STEPS: TourStep[] = [
  {
    id: 'upload-artifact',
    target: 'start-run',
    title: 'Upload your artifact',
    body: 'Kick off a fuzzing campaign by dropping in a .wasm contract. No configuration needed — CrashLab reads the exported functions and figures out what to break.',
  },
  {
    id: 'run-detail',
    target: 'nav-runs',
    title: 'Inspect your runs',
    body: 'Every campaign gets a run record. Open a run to see its status, the crash signature, and a replayable reproduction you can feed straight into CI.',
  },
  {
    id: 'crash-cluster',
    target: 'clusters',
    title: 'Crashes cluster by signature',
    body: 'Failures sharing a root cause group together. Instead of thousands of errors, you see a handful of distinct bugs — each with an exact call sequence.',
  },
  {
    id: 'triage-board',
    target: 'triage',
    title: 'Triage on the board',
    body: 'The kanban board moves crashes through open → in progress → fixed while identical failures stay grouped, so triage takes minutes, not days.',
  },
  {
    id: 'schedules',
    target: 'nav-schedules',
    title: 'Automate with schedules',
    body: 'Set a recurring campaign on a cron schedule to keep contracts continuously fuzzed, without remembering to launch each run manually.',
  },
];

// ── Pure helpers (node-testable) ──────────────────────────────────────────────

/** Verify a recently-written flag via read-back (mirrors the wizard hook). */
function verifyWriteable(storage: StorageLike, key: string): boolean {
  try {
    storage.setItem(key, 'true');
    return storage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persist tour dismissal durably with the same fallback ladder the onboarding
 * wizard uses: localStorage (read-back verified) → sessionStorage → in-memory
 * marker, so the tour never resurfaces in the current session.
 */
export function persistTourDismissal(
  persistentStorage: StorageLike | null,
  sessionStorageLike: StorageLike | null,
  inMemoryFlag: { value: boolean },
): TourDismissalResult {
  const persistent = persistentStorage !== null && verifyWriteable(persistentStorage, TOUR_DISMISSED_KEY);

  let sessionFallback = false;
  if (!persistent && sessionStorageLike !== null) {
    sessionFallback = verifyWriteable(sessionStorageLike, TOUR_DISMISSED_SESSION_KEY);
  }

  inMemoryFlag.value = true;
  return { persistent, sessionFallback };
}

/** Read the durable/session/in-memory dismissal flags. */
export function readTourDismissal(
  persistentStorage: StorageLike | null,
  sessionStorageLike: StorageLike | null,
  inMemoryFlag: { value: boolean },
): { persistent: boolean; sessionFallback: boolean; inMemory: boolean } {
  let persistent = false;
  let sessionFallback = false;
  try {
    persistent = persistentStorage?.getItem(TOUR_DISMISSED_KEY) === 'true' || false;
  } catch {
    persistent = false;
  }
  try {
    sessionFallback = sessionStorageLike?.getItem(TOUR_DISMISSED_SESSION_KEY) === 'true' || false;
  } catch {
    sessionFallback = false;
  }
  return { persistent, sessionFallback, inMemory: inMemoryFlag.value };
}

/**
 * Whether the tour should auto-start: the onboarding wizard is complete
 * (the user is past first-visit) and the tour has not been dismissed yet.
 */
export function shouldShowTour(wizardComplete: boolean, tourDismissed: boolean): boolean {
  return wizardComplete && !tourDismissed;
}

/** Sanity-check step config: unique ids and non-empty, stable anchors. */
export function validateTourSteps(steps: TourStep[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step.id.trim()) errors.push('A tour step is missing its id');
    if (seen.has(step.id)) errors.push(`Duplicate tour step id: "${step.id}"`);
    seen.add(step.id);
    if (!step.target.trim()) errors.push(`Tour step "${step.id}" is missing its target selector`);
    if (!step.title.trim()) errors.push(`Tour step "${step.id}" is missing its title`);
    if (!step.body.trim()) errors.push(`Tour step "${step.id}" is missing its body`);
  }
  return errors;
}

/** Resolve a step's spotlight anchor. Returns null when the anchor is absent (UI drift / lazy section). */
export function findTourStepTarget(
  doc: { querySelector(selector: string): Element | null },
  step: TourStep,
): Element | null {
  return doc.querySelector(`[data-tour="${step.target}"]`);
}

/** Progress percentage (1-based so the first step already reads as progress). */
export function getTourProgress(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round(((index + 1) / total) * 100);
}