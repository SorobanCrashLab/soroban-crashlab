import type { Metadata } from "next";
import { CiQualityDashboard } from "@/features/ci/CiQualityDashboard";

export const metadata: Metadata = {
  title: "CI checks & quality gates | Soroban CrashLab",
  description:
    "PR, branch, flake and release readiness with eight quality gates, failure correlation and rerun-aware status normalization.",
};

export const dynamic = "force-dynamic";

export default function CiQualityPage() {
  return <CiQualityDashboard />;
}
