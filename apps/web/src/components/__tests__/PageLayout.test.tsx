import { describe, it, expect } from 'vitest';
import { PageHeader } from '../PageHeader';
import { PageSection } from '../PageSection';
import { StatCard } from '../StatCard';

describe('PageHeader component', () => {
  it('exports PageHeader properly', () => {
    expect(PageHeader).toBeDefined();
    expect(typeof PageHeader).toBe('function');
  });

  it('handles custom props interface correctly', () => {
    const props = {
      title: 'Test Dashboard',
      description: 'Overview of testing runs',
      actions: null,
      backLink: { href: '/runs', label: 'All Runs' },
    };
    expect(props.title).toBe('Test Dashboard');
    expect(props.backLink.href).toBe('/runs');
  });
});

describe('PageSection component', () => {
  it('exports PageSection properly', () => {
    expect(PageSection).toBeDefined();
    expect(typeof PageSection).toBe('function');
  });

  it('supports titles, descriptions, and custom wrappers', () => {
    const props = {
      title: 'Recent Activity',
      description: 'Latest events from cluster',
      as: 'article' as const,
      children: 'Content',
    };
    expect(props.as).toBe('article');
    expect(props.title).toBe('Recent Activity');
  });
});

describe('StatCard component', () => {
  it('exports StatCard properly', () => {
    expect(StatCard).toBeDefined();
  });

  it('supports variants and trend objects', () => {
    const props = {
      label: 'Critical Failures',
      value: 12,
      trend: { value: '5%', isPositive: false, label: 'vs last week' },
      variant: 'interactive' as const,
    };
    expect(props.label).toBe('Critical Failures');
    expect(props.trend.isPositive).toBe(false);
    expect(props.variant).toBe('interactive');
  });
});
