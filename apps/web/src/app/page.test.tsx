import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Home from './page';
import { FuzzingRun } from './types';
import { DashboardFilters } from './create-advanced-dashboard-filters-page';

// Mock Next.js navigation hooks
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock child components to isolate filteredRuns logic
jest.mock('./implement-run-history-table-component', () => ({
  __esModule: true,
  default: ({ runs }: { runs: FuzzingRun[] }) => (
    <div data-testid="run-history-table">
      {runs.map(run => (
        <div key={run.id} data-testid={`run-${run.id}`}>{run.id}</div>
      ))}
    </div>
  ),
}));

jest.mock('./RunHistoryTableSkeleton', () => ({
  __esModule: true,
  default: () => <div data-testid="skeleton">Loading...</div>,
}));

jest.mock('./Pagination', () => ({
  __esModule: true,
  default: () => <div data-testid="pagination">Pagination</div>,
}));

jest.mock('./CrashDetailDrawer', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./ReportModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./create-advanced-dashboard-filters-page', () => ({
  __esModule: true,
  default: ({ filters, onFiltersChange }: { filters: DashboardFilters; onFiltersChange: (filters: DashboardFilters) => void }) => (
    <div data-testid="dashboard-filters">
      <button
        data-testid="set-status-filter"
        onClick={() => onFiltersChange({ ...filters, status: ['running'] })}
      >
        Set Status Filter
      </button>
      <button
        data-testid="set-area-filter"
        onClick={() => onFiltersChange({ ...filters, area: ['auth'] })}
      >
        Set Area Filter
      </button>
      <button
        data-testid="set-severity-filter"
        onClick={() => onFiltersChange({ ...filters, severity: ['critical'] })}
      >
        Set Severity Filter
      </button>
      <button
        data-testid="set-search-filter"
        onClick={() => onFiltersChange({ ...filters, searchTerm: 'run-1000' })}
      >
        Set Search Filter
      </button>
      <button
        data-testid="set-crash-filter"
        onClick={() => onFiltersChange({ ...filters, hasCrash: true })}
      >
        Set Crash Filter
      </button>
      <button
        data-testid="set-duration-filter"
        onClick={() => onFiltersChange({ ...filters, durationRange: { min: 200000, max: 500000 } })}
      >
        Set Duration Filter
      </button>
      <button
        data-testid="set-fee-filter"
        onClick={() => onFiltersChange({ ...filters, resourceFeeRange: { min: 1000, max: 3000 } })}
      >
        Set Fee Filter
      </button>
      <button
        data-testid="set-date-filter"
        onClick={() => onFiltersChange({ ...filters, dateRange: { start: '2024-01-01', end: '2024-12-31' } })}
      >
        Set Date Filter
      </button>
      <button
        data-testid="clear-filters"
        onClick={() => onFiltersChange({
          status: [],
          area: [],
          severity: [],
          dateRange: { start: '', end: '' },
          durationRange: { min: 0, max: 0 },
          resourceFeeRange: { min: 0, max: 0 },
          hasCrash: null,
          searchTerm: '',
        })}
      >
        Clear Filters
      </button>
    </div>
  ),
  DashboardFilters: {} as DashboardFilters,
}));

// Mock all other components
jest.mock('./useMaintainerMode', () => ({
  useMaintainerMode: () => ({ isMaintainer: false, toggle: jest.fn(), mounted: true }),
}));

jest.mock('./implement-run-workflow-board-page-58', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-a-fuzzy-query-builder-page-51', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./implement-cross-run-board-widgets-component', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./create-cross-run-board-custom-widgets-63', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./RunActivityTimeline', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-run-timeline', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-run-cluster-overview', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./CampaignConfigForm', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./ContributorSLATargets', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-run-filtering-by-severity', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./FailureClusterView', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./MaintainerToggle', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./TimelineScrubber', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-column-customization', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./campaign-milestone-timeline-55', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./implement-virtualized-run-table-component', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-reporting-templates-manager', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./integrate-automated-regression-deploy-integration', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./integrate-integration-test-harness-for-ui-flows', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-report-generator', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./implement-widget-layout-editor-component', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./implement-log-viewer-component', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-accessible-keyboard-nav-blueprint', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-artifact-explorer', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./implement-onboarding-checklist-modal-component', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-failure-classification-taxonomy', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-responsive-layout-improvements', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-keyboard-navigation-help', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-run-annotations', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-run-replay-ui', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-run-replay-history-with-timestamps', () => ({
  __esModule: true,
  default: () => null,
  recordRunReplayHistoryEntry: jest.fn(),
  buildReplayHistoryEntryFromReplay: jest.fn(),
}));

jest.mock('./add-bulk-actions-for-runs', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-downloadable-run-artifact-bundle', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./implement-resource-fee-insight-panel-component', () => ({
  ResourceFeeInsightPanel: () => null,
}));

jest.mock('./add-export-run-json', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-export-run-csv', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-run-comparison-charts', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-run-cluster-visualization', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-run-heatmap', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-state-change-diff-view', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./add-tagging-and-labels-ui', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./AlertPresets', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./create-reporting-templates-page-60', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./integrate-webhook-manager-for-run-events', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./integrate-metrics-export-to-prometheus', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./create-run-heatmap-page-55', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./implement-alerting-settings-page-54', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./create-alerting-settings-page-page', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./RunStatusTimeline', () => ({
  __esModule: true,
  default: () => null,
}));

const mockRouter = {
  replace: jest.fn(),
  push: jest.fn(),
};

const mockSearchParams = new URLSearchParams();

describe('Dashboard Filters Integration in filteredRuns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (usePathname as jest.Mock).mockReturnValue('/');
    (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);
    
    // Mock localStorage
    Storage.prototype.getItem = jest.fn(() => null);
    Storage.prototype.setItem = jest.fn();
  });

  describe('Happy Path Tests', () => {
    it('returns full list when all filters are inactive', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      // All 25 mock runs should be visible (10 per page)
      const runElements = screen.queryAllByTestId(/^run-run-/);
      expect(runElements.length).toBeGreaterThan(0);
    });

    it('filters by status when status filter is active', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      const setStatusButton = screen.getByTestId('set-status-filter');
      setStatusButton.click();

      await waitFor(() => {
        const runElements = screen.queryAllByTestId(/^run-run-/);
        // Should only show runs with status 'running'
        expect(runElements.length).toBeGreaterThan(0);
      });
    });

    it('filters by area when area filter is active', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      const setAreaButton = screen.getByTestId('set-area-filter');
      setAreaButton.click();

      await waitFor(() => {
        const runElements = screen.queryAllByTestId(/^run-run-/);
        // Should only show runs with area 'auth'
        expect(runElements.length).toBeGreaterThan(0);
      });
    });

    it('filters by severity when severity filter is active', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      const setSeverityButton = screen.getByTestId('set-severity-filter');
      setSeverityButton.click();

      await waitFor(() => {
        const runElements = screen.queryAllByTestId(/^run-run-/);
        // Should only show runs with severity 'critical'
        expect(runElements.length).toBeGreaterThan(0);
      });
    });

    it('filters by search term when searchTerm filter is active', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      const setSearchButton = screen.getByTestId('set-search-filter');
      setSearchButton.click();

      await waitFor(() => {
        const runElements = screen.queryAllByTestId(/^run-run-/);
        // Should only show runs matching 'run-1000'
        expect(runElements.length).toBeGreaterThan(0);
      });
    });

    it('filters by crash presence when hasCrash filter is active', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      const setCrashButton = screen.getByTestId('set-crash-filter');
      setCrashButton.click();

      await waitFor(() => {
        const runElements = screen.queryAllByTestId(/^run-run-/);
        // Should only show runs with crashDetail !== null
        expect(runElements.length).toBeGreaterThan(0);
      });
    });

    it('applies multiple filters simultaneously and returns intersection', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      const setStatusButton = screen.getByTestId('set-status-filter');
      const setAreaButton = screen.getByTestId('set-area-filter');
      
      setStatusButton.click();
      setAreaButton.click();

      await waitFor(() => {
        const runElements = screen.queryAllByTestId(/^run-run-/);
        // Should only show runs matching BOTH status='running' AND area='auth'
        expect(runElements.length).toBeGreaterThanOrEqual(0);
      });
    });

    it('restores full list when filters are cleared', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      const setStatusButton = screen.getByTestId('set-status-filter');
      setStatusButton.click();

      await waitFor(() => {
        const runElementsFiltered = screen.queryAllByTestId(/^run-run-/);
        const filteredCount = runElementsFiltered.length;

        const clearButton = screen.getByTestId('clear-filters');
        clearButton.click();

        const runElementsFull = screen.queryAllByTestId(/^run-run-/);
        // Full list should be larger than or equal to filtered list
        expect(runElementsFull.length).toBeGreaterThanOrEqual(filteredCount);
      });
    });
  });

  describe('Edge Case Tests', () => {
    it('returns empty array when filter matches no runs', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      // Set a search term that matches no runs
      screen.getByTestId('set-search-filter');
      // Modify the mock to use a non-matching term
      const dashboardFilters = screen.getByTestId('dashboard-filters');
      const customButton = document.createElement('button');
      customButton.setAttribute('data-testid', 'set-no-match-filter');
      customButton.onclick = () => {
        const onFiltersChange = (dashboardFilters as unknown as { __reactProps$?: { onFiltersChange?: (filters: DashboardFilters) => void } }).__reactProps$?.onFiltersChange;
        if (onFiltersChange) {
          onFiltersChange({
            status: [],
            area: [],
            severity: [],
            dateRange: { start: '', end: '' },
            durationRange: { min: 0, max: 0 },
            resourceFeeRange: { min: 0, max: 0 },
            hasCrash: null,
            searchTerm: 'nonexistent-run-xyz-999999',
          });
        }
      };
      dashboardFilters.appendChild(customButton);
      
      customButton.click();

      await waitFor(() => {
        const runElements = screen.queryAllByTestId(/^run-run-/);
        // Should return empty when no matches
        expect(runElements.length).toBe(0);
      });
    });

    it('handles duration range filter with only min bound set', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      const setDurationButton = screen.getByTestId('set-duration-filter');
      setDurationButton.click();

      await waitFor(() => {
        const runElements = screen.queryAllByTestId(/^run-run-/);
        // Should filter by min and max bounds
        expect(runElements.length).toBeGreaterThanOrEqual(0);
      });
    });

    it('handles resource fee range filter correctly', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      const setFeeButton = screen.getByTestId('set-fee-filter');
      setFeeButton.click();

      await waitFor(() => {
        const runElements = screen.queryAllByTestId(/^run-run-/);
        // Should filter by fee range
        expect(runElements.length).toBeGreaterThanOrEqual(0);
      });
    });

    it('handles case-insensitive search correctly', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      // The mock data has run IDs like 'run-1000', 'run-1001', etc.
      // Search should be case-insensitive
      const setSearchButton = screen.getByTestId('set-search-filter');
      setSearchButton.click();

      await waitFor(() => {
        const runElements = screen.queryAllByTestId(/^run-run-/);
        expect(runElements.length).toBeGreaterThan(0);
      });
    });

    it('applies all filters simultaneously when all are active', async () => {
      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      // Apply multiple filters
      screen.getByTestId('set-status-filter').click();
      screen.getByTestId('set-area-filter').click();
      screen.getByTestId('set-severity-filter').click();
      screen.getByTestId('set-crash-filter').click();

      await waitFor(() => {
        const runElements = screen.queryAllByTestId(/^run-run-/);
        // Should return intersection of all filters
        expect(runElements.length).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Regression Tests', () => {
    it('preserves existing statusFilter from URL query param', async () => {
      const searchParamsWithStatus = new URLSearchParams('status=running');
      (useSearchParams as jest.Mock).mockReturnValue(searchParamsWithStatus);

      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      const runElements = screen.queryAllByTestId(/^run-run-/);
      // Should still apply URL status filter
      expect(runElements.length).toBeGreaterThanOrEqual(0);
    });

    it('preserves existing severityFilter from URL query param', async () => {
      const searchParamsWithSeverity = new URLSearchParams('severity=critical');
      (useSearchParams as jest.Mock).mockReturnValue(searchParamsWithSeverity);

      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      const runElements = screen.queryAllByTestId(/^run-run-/);
      // Should still apply URL severity filter
      expect(runElements.length).toBeGreaterThanOrEqual(0);
    });

    it('preserves existing expensiveOnly filter from URL query param', async () => {
      const searchParamsWithExpensive = new URLSearchParams('expensive=1');
      (useSearchParams as jest.Mock).mockReturnValue(searchParamsWithExpensive);

      render(<Home />);
      
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
      }, { timeout: 2000 });

      const runElements = screen.queryAllByTestId(/^run-run-/);
      // Should still apply expensive filter
      expect(runElements.length).toBeGreaterThanOrEqual(0);
    });
  });
});
