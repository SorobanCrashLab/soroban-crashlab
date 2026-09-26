import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SortableColumnHeader } from './SortableColumnHeader';
import type { SortState } from '../app/run-history-sort-utils';

function renderInTable(ui: React.ReactElement) {
  return render(
    <table>
      <thead>
        <tr>{ui}</tr>
      </thead>
    </table>
  );
}

describe('SortableColumnHeader', () => {
  it('renders a <th scope="col"> with aria-sort="none" when inactive or un-sorted', () => {
    renderInTable(
      <SortableColumnHeader
        field="duration"
        label="Duration"
        sortState={null}
      />
    );

    const th = screen.getByRole('columnheader', { name: /duration/i });
    expect(th).toBeInTheDocument();
    expect(th).toHaveAttribute('scope', 'col');
    expect(th).toHaveAttribute('aria-sort', 'none');

    const button = screen.getByRole('button', { name: /duration, none. activate to sort ascending/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.className).toContain('focus-visible:ring-blue-500');
    expect(button).toHaveTextContent('↕');
  });

  it('renders aria-sort="ascending" and upward arrow when order is asc', () => {
    const sortState: SortState = { field: 'duration', order: 'asc' };
    renderInTable(
      <SortableColumnHeader
        field="duration"
        label="Duration"
        sortState={sortState}
      />
    );

    const th = screen.getByRole('columnheader', { name: /duration/i });
    expect(th).toHaveAttribute('aria-sort', 'ascending');

    const button = screen.getByRole('button', { name: /duration, ascending. activate to sort descending/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('↑');
  });

  it('renders aria-sort="descending" and downward arrow when order is desc', () => {
    const sortState: SortState = { field: 'duration', order: 'desc' };
    renderInTable(
      <SortableColumnHeader
        field="duration"
        label="Duration"
        sortState={sortState}
      />
    );

    const th = screen.getByRole('columnheader', { name: /duration/i });
    expect(th).toHaveAttribute('aria-sort', 'descending');

    const button = screen.getByRole('button', { name: /duration, descending. activate to remove sorting/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('↓');
  });

  it('renders aria-sort="none" when another column is active', () => {
    const sortState: SortState = { field: 'status', order: 'asc' };
    renderInTable(
      <SortableColumnHeader
        field="duration"
        label="Duration"
        sortState={sortState}
      />
    );

    const th = screen.getByRole('columnheader', { name: /duration/i });
    expect(th).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('button')).toHaveTextContent('↕');
  });

  it('invokes onSort callback with field name on click', () => {
    const onSort = vi.fn();
    renderInTable(
      <SortableColumnHeader
        field="id"
        label="Run ID"
        onSort={onSort}
      />
    );

    const button = screen.getByRole('button', { name: /run id/i });
    fireEvent.click(button);

    expect(onSort).toHaveBeenCalledTimes(1);
    expect(onSort).toHaveBeenCalledWith('id');
  });

  it('invokes onSort on keyboard Enter and Space activation', () => {
    const onSort = vi.fn();
    renderInTable(
      <SortableColumnHeader
        field="id"
        label="Run ID"
        onSort={onSort}
      />
    );

    const button = screen.getByRole('button', { name: /run id/i });
    fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
    // Native HTML buttons trigger click event on Enter/Space
    fireEvent.click(button);

    expect(onSort).toHaveBeenCalledWith('id');
  });
});
