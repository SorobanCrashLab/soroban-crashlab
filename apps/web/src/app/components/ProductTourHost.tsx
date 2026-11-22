"use client";

import { useProductTour } from "../hooks/useProductTour";
import { PRODUCT_TOUR_STEPS } from "../tour-utils";
import ProductTour from "./ProductTour";
import { useToast } from "../../components/Toast";

/**
 * Hosts the guided product tour. Mounted on the dashboard (the first screen a
 * post-onboarding user lands on); auto-starts when the onboarding wizard is
 * complete and the tour has not been dismissed yet.
 */
export default function ProductTourHost() {
  const { notifyError } = useToast();
  const {
    active,
    hydrated,
    currentIndex,
    stepCount,
    progress,
    next,
    prev,
    dismiss,
  } = useProductTour({
    onPersistenceError: (message) => notifyError(message),
  });

  if (!hydrated || !active) return null;

  return (
    <ProductTour
      open={active}
      steps={PRODUCT_TOUR_STEPS}
      currentIndex={Math.min(currentIndex, stepCount - 1)}
      progress={progress}
      onNext={next}
      onPrev={prev}
      onSkip={dismiss}
    />
  );
}