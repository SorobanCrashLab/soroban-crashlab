import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdvancedDashboardFilters, { DashboardFilters } from './create-advanced-dashboard-filters-page';

const defaultFilters: DashboardFilters = {
  status: [],
  area: [],
  severity: [],
  dateRange: { start: '', end: '' },
  durationRange: { min: 0, max: 0 },
  resourceFeeRange: { min: 0, max: 0 },
  hasCrash: null,
  searchTerm: '',
};

describe('AdvancedDashboardFilters', () => {
  const mockOnFiltersChange = jest.fn();
  const mockOnReset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Primary Flow', () => {
    it('renders filter component with all basic filters', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      expect(screen.getByText('Dashboard Filters')).toBeInTheDocument();
      expect(screen.getByLabelText('Search Runs')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Area')).toBeInTheDocument();
      expect(screen.getByText('Severity')).toBeInTheDocument();
    });

    it('updates search term when user types', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const searchInput = screen.getByLabelText('Search Runs');
      fireEvent.change(searchInput, { target: { value: 'test search' } });

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        searchTerm: 'test search',
      });
    });

    it('toggles status filter when checkbox is clicked', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const runningCheckbox = screen.getByLabelText('running');
      fireEvent.click(runningCheckbox);

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        status: ['running'],
      });
    });

    it('toggles area filter when checkbox is clicked', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const authCheckbox = screen.getByLabelText('auth');
      fireEvent.click(authCheckbox);

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        area: ['auth'],
      });
    });

    it('toggles severity filter when checkbox is clicked', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const criticalCheckbox = screen.getByLabelText('critical');
      fireEvent.click(criticalCheckbox);

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        severity: ['critical'],
      });
    });

    it('expands advanced filters when button is clicked', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const advancedButton = screen.getByText('Advanced Filters');
      fireEvent.click(advancedButton);

      expect(screen.getByText('Date Range')).toBeInTheDocument();
      expect(screen.getByText('Has Crash')).toBeInTheDocument();
      expect(screen.getByText('Duration Range (minutes)')).toBeInTheDocument();
      expect(screen.getByText('Resource Fee Range')).toBeInTheDocument();
    });

    it('resets all filters when Reset All button is clicked', () => {
      const filtersWithValues: DashboardFilters = {
        ...defaultFilters,
        status: ['running'],
        area: ['auth'],
        severity: ['critical'],
        searchTerm: 'test',
      };

      render(
        <AdvancedDashboardFilters
          filters={filtersWithValues}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const resetButton = screen.getByText('Reset All');
      fireEvent.click(resetButton);

      expect(mockOnReset).toHaveBeenCalledTimes(1);
    });

    it('displays active filter count badge when filters are active', () => {
      const filtersWithValues: DashboardFilters = {
        ...defaultFilters,
        status: ['running'],
        searchTerm: 'test',
      };

      render(
        <AdvancedDashboardFilters
          filters={filtersWithValues}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      expect(screen.getByText('2 active')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('disables all inputs when isLoading is true', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          isLoading={true}
        />
      );

      const searchInput = screen.getByLabelText('Search Runs');
      expect(searchInput).toBeDisabled();

      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach((checkbox) => {
        expect(checkbox).toBeDisabled();
      });

      const resetButton = screen.getByText('Reset All');
      expect(resetButton).toBeDisabled();
    });

    it('shows loading overlay when isLoading is true', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          isLoading={true}
        />
      );

      expect(screen.getByText('Loading filters...')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('displays error message when error prop is provided', () => {
      const errorMessage = 'Failed to load filters';

      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          error={errorMessage}
        />
      );

      expect(screen.getByText(errorMessage)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Keyboard Accessibility', () => {
    it('closes advanced filters when Escape key is pressed', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const advancedButton = screen.getByText('Advanced Filters');
      fireEvent.click(advancedButton);

      expect(screen.getByText('Date Range')).toBeInTheDocument();

      const container = screen.getByRole('region');
      fireEvent.keyDown(container, { key: 'Escape' });

      expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
    });

    it('has proper ARIA attributes for accessibility', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const region = screen.getByRole('region');
      expect(region).toHaveAttribute('aria-labelledby', 'dashboard-filters-heading');

      const heading = screen.getByText('Dashboard Filters');
      expect(heading).toHaveAttribute('id', 'dashboard-filters-heading');
    });

    it('has aria-expanded on advanced filters button', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const advancedButton = screen.getByText('Advanced Filters');
      expect(advancedButton).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(advancedButton);
      expect(advancedButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('has aria-controls on advanced filters button', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const advancedButton = screen.getByText('Advanced Filters');
      expect(advancedButton).toHaveAttribute('aria-controls', 'advanced-filters-panel');
    });

    it('has proper labels for all form inputs', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      expect(screen.getByLabelText('Search Runs')).toBeInTheDocument();
      expect(screen.getByLabelText('running')).toBeInTheDocument();
      expect(screen.getByLabelText('auth')).toBeInTheDocument();
      expect(screen.getByLabelText('critical')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles removing a filter that is already selected', () => {
      const filtersWithStatus: DashboardFilters = {
        ...defaultFilters,
        status: ['running'],
      };

      render(
        <AdvancedDashboardFilters
          filters={filtersWithStatus}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const runningCheckbox = screen.getByLabelText('running');
      fireEvent.click(runningCheckbox);

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        status: [],
      });
    });

    it('handles multiple filter selections correctly', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const runningCheckbox = screen.getByLabelText('running');
      const completedCheckbox = screen.getByLabelText('completed');

      fireEvent.click(runningCheckbox);
      fireEvent.click(completedCheckbox);

      expect(mockOnFiltersChange).toHaveBeenLastCalledWith({
        ...defaultFilters,
        status: ['running', 'completed'],
      });
    });

    it('handles date range changes correctly', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const advancedButton = screen.getByText('Advanced Filters');
      fireEvent.click(advancedButton);

      const startDateInput = screen.getByLabelText('Date Range');
      fireEvent.change(startDateInput, { target: { value: '2024-01-01' } });

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        dateRange: { ...defaultFilters.dateRange, start: '2024-01-01' },
      });
    });

    it('handles crash filter selection', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const advancedButton = screen.getByText('Advanced Filters');
      fireEvent.click(advancedButton);

      const crashSelect = screen.getByLabelText('Has Crash');
      fireEvent.change(crashSelect, { target: { value: 'true' } });

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        hasCrash: true,
      });
    });

    it('handles numeric range inputs correctly', () => {
      render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const advancedButton = screen.getByText('Advanced Filters');
      fireEvent.click(advancedButton);

      const durationMinInput = screen.getByPlaceholderText('Min');
      fireEvent.change(durationMinInput, { target: { value: '10' } });

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        durationRange: { ...defaultFilters.durationRange, min: 10 },
      });
    });

    it('handles empty string inputs for numeric ranges', () => {
      const filtersWithDuration: DashboardFilters = {
        ...defaultFilters,
        durationRange: { min: 10, max: 100 },
      };

      render(
        <AdvancedDashboardFilters
          filters={filtersWithDuration}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const advancedButton = screen.getByText('Advanced Filters');
      fireEvent.click(advancedButton);

      const durationMinInput = screen.getByPlaceholderText('Min');
      fireEvent.change(durationMinInput, { target: { value: '' } });

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        durationRange: { ...defaultFilters.durationRange, min: 0 },
      });
    });

    it('calculates active filter count correctly with mixed filter types', () => {
      const mixedFilters: DashboardFilters = {
        status: ['running'],
        area: ['auth', 'state'],
        severity: [],
        dateRange: { start: '2024-01-01', end: '' },
        durationRange: { min: 0, max: 0 },
        resourceFeeRange: { min: 100, max: 0 },
        hasCrash: null,
        searchTerm: '',
      };

      render(
        <AdvancedDashboardFilters
          filters={mixedFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      // status (1) + area (1, since both are in one array) + dateRange (1) + resourceFeeRange (1) = 4 active
      expect(screen.getByText('4 active')).toBeInTheDocument();
    });
  });

  describe('Responsive Layout', () => {
    it('renders with responsive grid classes', () => {
      const { container } = render(
        <AdvancedDashboardFilters
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
        />
      );

      const grid = container.querySelector('.grid');
      expect(grid).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3');
    });
  });

  describe('Dark Mode Support', () => {
    it('applies dark mode classes when rendered in dark context', () => {
      const { container } = render(
        <div className="dark">
          <AdvancedDashboardFilters
            filters={defaultFilters}
            onFiltersChange={mockOnFiltersChange}
            onReset={mockOnReset}
          />
        </div>
      );

      const mainContainer = container.querySelector('.bg-white.dark\\:bg-zinc-950');
      expect(mainContainer).toBeInTheDocument();
    });
  });
});
