import type { Metadata } from "next";
import { AccessibilityComplianceCenter } from "@/features/a11y-compliance/AccessibilityComplianceCenter";

export const metadata: Metadata = {
  title: "Accessibility compliance | Soroban CrashLab",
  description: "Accessibility findings, remediation tracking, WCAG conformance and release gates.",
};

export const dynamic = "force-dynamic";

export default function AccessibilityCompliancePage() {
  return (
    <div className="container-full page-padding fade-in">
      <h1 id="a11y-compliance-title" className="heading-page">
        Accessibility compliance
      </h1>
      <p className="text-meta mt-1 mb-6 max-w-3xl">
        Automated (axe/CI, lint, runtime) and manual audit findings, deduplicated by route and component, mapped to
        WCAG 2.2 criteria and tracked through remediation to the release accessibility gate.
      </p>
      <AccessibilityComplianceCenter />
    </div>
  );
}
