import React from "react";
import { render, fireEvent } from "@testing-library/react";
import {
  computeResourceMetrics,
  ResourceFeeInsightPanel,
} from "./add-resource-fee-insight-panel";
import { FuzzingRun } from "./types";

// Helper to build a minimal FuzzingRun
function makeRun(overrides: Partial<FuzzingRun>): FuzzingRun {
  return {
    id: "test-id",
    status: "completed",
    area: "auth",
    severity: "low",
    duration: 1000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 100,
    memoryBytes: 1024,
    minResourceFee: 100,
    ...overrides,
  };
}

describe("computeResourceMetrics", () => {
  describe("empty array", () => {
    it("returns zero metrics", () => {
      const result = computeResourceMetrics([]);
      expect(result.avgCpu).toBe(0);
      expect(result.maxCpu).toBe(0);
      expect(result.avgMemory).toBe(0);
      expect(result.maxMemory).toBe(0);
      expect(result.avgFee).toBe(0);
      expect(result.maxFee).toBe(0);
      expect(result.expensiveRuns).toEqual([]);
      expect(result.totalRuns).toBe(0);
    });
  });

  describe("single run", () => {
    it("returns run metrics as averages and maxima", () => {
      const run = makeRun({
        cpuInstructions: 500,
        memoryBytes: 2048,
        minResourceFee: 200,
      });
      const result = computeResourceMetrics([run]);
      expect(result.avgCpu).toBe(500);
      expect(result.maxCpu).toBe(500);
      expect(result.avgMemory).toBe(2048);
      expect(result.maxMemory).toBe(2048);
      expect(result.avgFee).toBe(200);
      expect(result.maxFee).toBe(200);
      expect(result.totalRuns).toBe(1);
    });
  });

  describe("multiple runs", () => {
    it("calculates averages and maxima correctly", () => {
      const runs = [
        makeRun({ cpuInstructions: 100, memoryBytes: 1024, minResourceFee: 50 }),
        makeRun({ cpuInstructions: 200, memoryBytes: 2048, minResourceFee: 100 }),
        makeRun({ cpuInstructions: 300, memoryBytes: 3072, minResourceFee: 150 }),
      ];
      const result = computeResourceMetrics(runs);
      expect(result.avgCpu).toBe(200); // (100+200+300)/3
      expect(result.maxCpu).toBe(300);
      expect(result.avgMemory).toBe(2048); // (1024+2048+3072)/3
      expect(result.maxMemory).toBe(3072);
      expect(result.avgFee).toBe(100); // (50+100+150)/3
      expect(result.maxFee).toBe(150);
      expect(result.totalRuns).toBe(3);
    });
  });

  describe("expensive runs detection", () => {
    it("identifies runs exceeding critical thresholds", () => {
      const runs = [
        makeRun({
          id: "normal-run",
          cpuInstructions: 100000, // Below critical (5M)
          memoryBytes: 100000, // Below critical (10MB)
          minResourceFee: 100, // Below critical (5000)
        }),
        makeRun({
          id: "expensive-cpu",
          cpuInstructions: 6000000, // Above critical (5M)
          memoryBytes: 100000,
          minResourceFee: 100,
        }),
        makeRun({
          id: "expensive-memory",
          cpuInstructions: 100000,
          memoryBytes: 15000000, // Above critical (10MB)
          minResourceFee: 100,
        }),
        makeRun({
          id: "expensive-fee",
          cpuInstructions: 100000,
          memoryBytes: 100000,
          minResourceFee: 6000, // Above critical (5000)
        }),
      ];
      const result = computeResourceMetrics(runs);
      expect(result.expensiveRuns).toHaveLength(3);
      const expensiveIds = result.expensiveRuns.map(run => run.id);
      expect(expensiveIds).toContain("expensive-cpu");
      expect(expensiveIds).toContain("expensive-memory");
      expect(expensiveIds).toContain("expensive-fee");
      expect(expensiveIds).not.toContain("normal-run");
    });

    it("returns empty array when no runs exceed thresholds", () => {
      const runs = [
        makeRun({ cpuInstructions: 100000, memoryBytes: 100000, minResourceFee: 100 }),
        makeRun({ cpuInstructions: 500000, memoryBytes: 500000, minResourceFee: 500 }),
      ];
      const result = computeResourceMetrics(runs);
      expect(result.expensiveRuns).toEqual([]);
    });
  });
});

describe("ResourceFeeInsightPanel", () => {
  describe("loading state", () => {
    it("renders loading skeleton", () => {
      const { container } = render(
        <ResourceFeeInsightPanel runs={[]} dataState="loading" />
      );
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(container).toHaveTextContent("Resource Fee Insight loading");
    });
  });

  describe("error state", () => {
    it("renders error message and retry button", () => {
      const mockOnRetry = jest.fn();
      const { getByText, getByRole } = render(
        <ResourceFeeInsightPanel
          runs={[]}
          dataState="error"
          errorMessage="Test error"
          onRetry={mockOnRetry}
        />
      );
      expect(getByText("Resource Fee Insight")).toBeInTheDocument();
      expect(getByText("Test error")).toBeInTheDocument();
      const retryButton = getByRole("button", { name: "Retry resource insight" });
      expect(retryButton).toBeInTheDocument();
      fireEvent.click(retryButton);
      expect(mockOnRetry).toHaveBeenCalled();
    });

    it("renders default error message when none provided", () => {
      const { getByText } = render(
        <ResourceFeeInsightPanel runs={[]} dataState="error" />
      );
      expect(getByText("Resource metrics are unavailable. Retry to refresh resource diagnostics.")).toBeInTheDocument();
    });
  });

  describe("success state", () => {
    it("renders metrics for normal resource usage", () => {
      const runs = [
        makeRun({ cpuInstructions: 500000, memoryBytes: 1048576, minResourceFee: 500 }),
      ];
      const { getByText, container } = render(
        <ResourceFeeInsightPanel runs={runs} />
      );
      expect(getByText("Resource Fee Insight")).toBeInTheDocument();
      expect(getByText("500K")).toBeInTheDocument(); // CPU
      expect(getByText("1.0MB")).toBeInTheDocument(); // Memory
      expect(getByText("500")).toBeInTheDocument(); // Fee
      // Should not show expensive runs section
      expect(container).not.toHaveTextContent("Expensive Runs Requiring Attention");
    });

    it("renders warning styles for high resource usage", () => {
      const runs = [
        makeRun({
          cpuInstructions: 2000000, // Above warning (1M), below critical (5M)
          memoryBytes: 2000000, // Above warning (1MB), below critical (10MB)
          minResourceFee: 2000, // Above warning (1000), below critical (5000)
        }),
      ];
      const { container } = render(
        <ResourceFeeInsightPanel runs={runs} />
      );
      // Should have amber/warning styling
      expect(container.querySelector('.bg-amber-50')).toBeInTheDocument();
    });

    it("renders critical styles for very high resource usage", () => {
      const runs = [
        makeRun({
          cpuInstructions: 6000000, // Above critical (5M)
          memoryBytes: 15000000, // Above critical (10MB)
          minResourceFee: 6000, // Above critical (5000)
        }),
      ];
      const { container } = render(
        <ResourceFeeInsightPanel runs={runs} />
      );
      // Should have red/critical styling
      expect(container.querySelector('.bg-red-50')).toBeInTheDocument();
    });

    it("renders expensive runs section when runs exceed thresholds", () => {
      const runs = [
        makeRun({
          id: "expensive-1",
          cpuInstructions: 6000000, // Critical
          memoryBytes: 100000,
          minResourceFee: 100,
        }),
        makeRun({
          id: "normal-1",
          cpuInstructions: 100000,
          memoryBytes: 100000,
          minResourceFee: 100,
        }),
      ];
      const mockOnRunClick = jest.fn();
      const { getByText, getByRole } = render(
        <ResourceFeeInsightPanel runs={runs} onRunClick={mockOnRunClick} />
      );
      expect(getByText("Expensive Runs Requiring Attention")).toBeInTheDocument();
      expect(getByText("1 expensive run")).toBeInTheDocument();
      expect(getByText("Run expensive-1")).toBeInTheDocument();

      const viewButton = getByRole("button", { name: "View Details" });
      fireEvent.click(viewButton);
      expect(mockOnRunClick).toHaveBeenCalledWith("expensive-1");
    });

    it("limits expensive runs display to 5 and shows count of remaining", () => {
      const runs = Array.from({ length: 7 }, (_, i) =>
        makeRun({
          id: `expensive-${i}`,
          cpuInstructions: 6000000, // Critical
          memoryBytes: 100000,
          minResourceFee: 100,
        })
      );
      const { getByText } = render(
        <ResourceFeeInsightPanel runs={runs} />
      );
      expect(getByText("7 expensive runs")).toBeInTheDocument();
      expect(getByText("And 2 more expensive runs...")).toBeInTheDocument();
      // Should only show 5 runs in the list
      expect(getByText("Run expensive-0")).toBeInTheDocument();
      expect(getByText("Run expensive-4")).toBeInTheDocument();
      expect(() => getByText("Run expensive-5")).toThrow();
    });

    it("renders threshold information", () => {
      const runs = [makeRun({})];
      const { getByText } = render(
        <ResourceFeeInsightPanel runs={runs} />
      );
      expect(getByText("Threshold Levels")).toBeInTheDocument();
      expect(getByText(/CPU: Warning ≥1.0M, Critical ≥5.0M/)).toBeInTheDocument();
      expect(getByText(/Memory: Warning ≥1.0MB, Critical ≥10.0MB/)).toBeInTheDocument();
      expect(getByText(/Fee: Warning ≥1,000, Critical ≥5,000 stroops/)).toBeInTheDocument();
    });
  });
});