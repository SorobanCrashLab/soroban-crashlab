"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { findTourStepTarget, type TourStep } from "../tour-utils";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ProductTourProps {
  open: boolean;
  steps: TourStep[];
  currentIndex: number;
  progress: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

const CARD_WIDTH = 320;
const VIEWPORT_MARGIN = 16;
const SPOTLIGHT_RADIUS = 12;

/**
 * Spotlight overlay that guides a post-onboarding user through the core loop.
 *
 * - Highlights the current step's target element with a "hole" cast via a huge
 *   box-shadow, dimming the rest of the viewport (the classic spotlight trick).
 * - Renders a modal card with progress, Skip / Back / Next, and a11y semantics
 *   (role="dialog", aria-modal, aria-labelledby, focus trap, Escape handling).
 * - Honors `prefers-reduced-motion`: target scrolling, spotlight movement, and
 *   the progress bar animation degrade to instant/no motion.
 * - Degrades gracefully when a step's target selector no longer resolves (UI
 *   drift): the card stays usable and is centered instead of anchored.
 */
export default function ProductTour({
  open,
  steps,
  currentIndex,
  progress,
  onNext,
  onPrev,
  onSkip,
}: ProductTourProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const tooltipRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const step = steps[currentIndex];

  const updateRect = useCallback(() => {
    const target = findTourStepTarget(document, steps[currentIndex]);
    if (!target) {
      setRect(null);
      return;
    }
    const bounds = target.getBoundingClientRect();
    // Hidden targets (e.g. a desktop-only nav link on a small viewport)
    // collapse to a zero-area rect; degrade to the centered card instead of
    // floating a zero-sized spotlight.
    if (bounds.width <= 0 || bounds.height <= 0) {
      setRect(null);
      return;
    }
    setRect({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    });
  }, [steps, currentIndex]);

  // Respect the user's motion preference; disable when reduced motion is set.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    const raf = requestAnimationFrame(sync);
    media.addEventListener("change", onChange);
    return () => {
      cancelAnimationFrame(raf);
      media.removeEventListener("change", onChange);
    };
  }, []);

  // Recompute the spotlight whenever the step changes and on viewport churn.
  useEffect(() => {
    if (!open) return;
    const target = findTourStepTarget(document, steps[currentIndex]);
    if (target && (target as HTMLElement).offsetParent !== null) {
      target.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: reducedMotion ? "auto" : "smooth",
      });
    }

    const handleScroll = () => updateRect();
    const handleResize = () => updateRect();
    window.addEventListener("scroll", handleScroll, { capture: true });
    window.addEventListener("resize", handleResize);
    // Re-read the rect on the next frame, after the browser settles scroll + layout.
    const raf = requestAnimationFrame(() => requestAnimationFrame(updateRect));

    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(raf);
    };
  }, [open, steps, currentIndex, reducedMotion, updateRect]);

  // Remember what to restore focus to, then let useFocusTrap own the dialog.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  // Focus is trapped in the dialog; Escape dismisses the tour via onSkip.
  useFocusTrap(tooltipRef, restoreRef, open, onSkip);

  if (!open || !step) return null;

  // Horizontal anchoring: center the card on the spotlight, clamped to the viewport.
  let cardLeft = Math.round(VIEWPORT_MARGIN);
  let cardTop = Math.round(VIEWPORT_MARGIN);
  if (rect) {
    const centered = Math.round(rect.left + rect.width / 2 - CARD_WIDTH / 2);
    cardLeft = Math.min(Math.max(centered, VIEWPORT_MARGIN), window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN);
    const below = rect.top + rect.height + 16;
    const above = rect.top - 16 - 220;
    cardTop = below + 220 <= window.innerHeight || above < VIEWPORT_MARGIN ? below : Math.max(above, VIEWPORT_MARGIN);
  } else {
    // Target unresolved (UI drift / lazy section): center the card instead.
    cardLeft = Math.round(window.innerWidth / 2 - CARD_WIDTH / 2);
    cardTop = Math.round(window.innerHeight / 2 - 120);
  }

  const spotlightStyle: React.CSSProperties | null = rect
    ? {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        borderRadius: SPOTLIGHT_RADIUS,
        boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
        transition: reducedMotion ? "none" : "left 220ms ease, top 220ms ease, width 220ms ease, height 220ms ease",
      }
    : null;

  const isLast = currentIndex === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-[9999]"
      style={{ pointerEvents: "auto" }}
      data-testid="product-tour-overlay"
    >
      {/* Backdrop dim; the spotlight hole sits above it and re-exposes the target. */}
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.55)", pointerEvents: "auto" }} />

      {spotlightStyle && (
        <div
          className="absolute"
          style={{ ...spotlightStyle, pointerEvents: "auto" }}
          data-testid="product-tour-spotlight"
        />
      )}

      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-tour-title"
        aria-describedby="product-tour-body"
        tabIndex={-1}
        data-testid="product-tour-dialog"
        className="fixed rounded-xl shadow-2xl"
        style={{
          left: cardLeft,
          top: cardTop,
          width: CARD_WIDTH,
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        <div className="p-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              Step {currentIndex + 1} of {steps.length}
            </p>
            <span className="sr-only" aria-live="polite">
              {progress}% complete
            </span>
          </div>

          <h2 id="product-tour-title" data-testid="product-tour-title" className="text-base font-bold mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
            {step.title}
          </h2>
          <p id="product-tour-body" className="text-[13px] leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
            {step.body}
          </p>

          <div className="h-1.5 w-full overflow-hidden rounded-full mb-4" style={{ backgroundColor: "var(--border-color)" }} aria-hidden="true">
            <div
              className="h-full rounded-full"
              data-testid="product-tour-progress-bar"
              style={{
                width: `${progress}%`,
                backgroundColor: "var(--text-primary)",
                transition: reducedMotion ? "none" : "width 220ms ease",
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg px-3 py-2 text-xs font-semibold"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}
              aria-label="Skip the tour"
            >
              Skip
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrev}
                disabled={currentIndex === 0}
                className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
                style={{ color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
                data-testid="product-tour-prev"
              >
                Back
              </button>
              <button
                type="button"
                onClick={isLast ? onSkip : onNext}
                className="rounded-lg px-4 py-2 text-xs font-bold"
                style={{ backgroundColor: "var(--text-primary)", color: "var(--bg)" }}
                data-testid="product-tour-next"
              >
                {isLast ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}