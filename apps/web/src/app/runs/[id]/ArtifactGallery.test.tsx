/**
 * Unit tests for ArtifactGallery component.
 * Issue #1350 & #1349: Handle runs with zero artifacts gracefully.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ArtifactGallery from "./ArtifactGallery";
import type { FuzzingRun } from "../../types";

const mockRunWithArtifacts: FuzzingRun = {
  id: "run-123",
  status: "success",
  queuedAt: "2026-01-01T00:00:00Z",
  cpuInstructions: 500_000,
  memoryBytes: 5_000_000,
  minResourceFee: 2000,
  artifacts: [
    { id: "art-1", name: "crash.bin", type: "crash", size: 1024 * 100 },
    { id: "art-2", name: "seed.dat", type: "seed", size: 1024 * 50 },
  ],
};

const mockRunWithZeroArtifacts: FuzzingRun = {
  id: "run-456",
  status: "failed",
  queuedAt: "2026-01-01T00:00:00Z",
  cpuInstructions: 100_000,
  memoryBytes: 1_000_000,
  minResourceFee: 500,
  artifacts: [],
};

const mockRunWithUndefinedArtifacts: FuzzingRun = {
  id: "run-789",
  status: "failed",
  queuedAt: "2026-01-01T00:00:00Z",
  cpuInstructions: 100_000,
  memoryBytes: 1_000_000,
  minResourceFee: 500,
};

describe("ArtifactGallery", () => {
  it("should render empty state when artifacts array is empty", () => {
    const html = renderToStaticMarkup(<ArtifactGallery run={mockRunWithZeroArtifacts} />);

    expect(html).toContain("No artifacts were produced by this run");
    expect(html).toContain("This run may have failed before generating any artifacts");
    expect(html).toContain("artifacts empty state illustration");
  });

  it("should render empty state when artifacts field is undefined", () => {
    const html = renderToStaticMarkup(<ArtifactGallery run={mockRunWithUndefinedArtifacts} />);

    expect(html).toContain("No artifacts were produced by this run");
  });

  it("should render artifact list when artifacts exist", () => {
    const html = renderToStaticMarkup(<ArtifactGallery run={mockRunWithArtifacts} />);

    expect(html).toContain("Artifacts (2)");
    expect(html).toContain("crash.bin");
    expect(html).toContain("seed.dat");
    expect(html).toContain("100.0 KB");
    expect(html).toContain("50.0 KB");
  });

  it("should not crash when rendering with zero artifacts", () => {
    expect(() => {
      renderToStaticMarkup(<ArtifactGallery run={mockRunWithZeroArtifacts} />);
    }).not.toThrow();
  });

  it("should hide download and action buttons when no artifacts", () => {
    const html = renderToStaticMarkup(
      <ArtifactGallery run={mockRunWithZeroArtifacts} />,
    );

    expect(html).not.toContain("<button");
  });
});
