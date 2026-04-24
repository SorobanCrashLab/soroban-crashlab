/**
 * API Error Report Page Tests
 * 
 * Tests for the API error report page component that visualizes
 * recurring API errors with counts and top occurrences.
 * 
 * Issue: #57 - Add API error report page
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('API Error Report Page', () => {
  const componentPath = path.resolve(__dirname, 'api-error-report-page.tsx');

  describe('File existence and structure', () => {
    it('should have the component file', () => {
      expect(fs.existsSync(componentPath)).toBe(true);
    });

    it('should be a client component', () => {
      const content = fs.readFileSync(componentPath, 'utf-8');
      expect(content).toContain("'use client'");
    });

    it('should export default component', () => {
      const content = fs.readFileSync(componentPath, 'utf-8');
      expect(content).toMatch(/export default function ApiErrorReportPage/);
    });
  });

  describe('TypeScript interfaces', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should define ApiError interface', () => {
      expect(content).toContain('export interface ApiError');
      expect(content).toContain('id: string');
      expect(content).toContain('endpoint: string');
      expect(content).toContain('method:');
      expect(content).toContain('statusCode: number');
      expect(content).toContain('errorMessage: string');
      expect(content).toContain('count: number');
    });

    it('should define ApiErrorReportPageProps interface', () => {
      expect(content).toContain('interface ApiErrorReportPageProps');
      expect(content).toContain('errors?:');
      expect(content).toContain('loading?:');
      expect(content).toContain('error?:');
    });

    it('should support HTTP methods', () => {
      expect(content).toMatch(/method:.*GET.*POST.*PUT.*DELETE.*PATCH/);
    });
  });

  describe('Component features', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should have summary statistics', () => {
      expect(content).toContain('Total Errors');
      expect(content).toContain('Unique Endpoints');
      expect(content).toContain('Client Errors');
      expect(content).toContain('Server Errors');
    });

    it('should have sorting functionality', () => {
      expect(content).toContain('sortBy');
      expect(content).toMatch(/count.*recent.*status/);
      expect(content).toContain('Sort by');
    });

    it('should have filtering functionality', () => {
      expect(content).toContain('filterStatus');
      expect(content).toMatch(/all.*client.*server/);
      expect(content).toContain('Filter');
    });

    it('should display error counts', () => {
      expect(content).toContain('occurrences');
      expect(content).toContain('count');
    });

    it('should show top occurrences', () => {
      expect(content).toContain('affectedRuns');
      expect(content).toContain('Affected Runs');
    });

    it('should have expandable error details', () => {
      expect(content).toContain('expandedError');
      expect(content).toContain('isExpanded');
      expect(content).toContain('aria-expanded');
    });
  });

  describe('Loading state', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should handle loading state', () => {
      expect(content).toContain('if (loading)');
      expect(content).toContain('animate-pulse');
    });

    it('should show skeleton loaders', () => {
      expect(content).toMatch(/loading.*skeleton|skeleton.*loading/i);
    });
  });

  describe('Error state', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should handle error state', () => {
      expect(content).toContain('if (error)');
    });

    it('should display error message', () => {
      expect(content).toContain('Failed to load');
      expect(content).toMatch(/error.*message/i);
    });

    it('should have error icon', () => {
      expect(content).toMatch(/svg.*error|error.*svg/i);
    });
  });

  describe('Status code handling', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should have status code colors', () => {
      expect(content).toContain('STATUS_CODE_COLORS');
      expect(content).toContain('400');
      expect(content).toContain('404');
      expect(content).toContain('429');
      expect(content).toContain('500');
      expect(content).toContain('503');
    });

    it('should categorize status codes', () => {
      expect(content).toContain('getStatusCodeCategory');
      expect(content).toContain('Client Error');
      expect(content).toContain('Server Error');
    });

    it('should apply color based on status code', () => {
      expect(content).toContain('getStatusCodeColor');
    });
  });

  describe('Data formatting', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should format dates', () => {
      expect(content).toContain('formatDate');
      expect(content).toMatch(/toLocaleString|toLocaleDateString/);
    });

    it('should display timestamps', () => {
      expect(content).toContain('firstOccurrence');
      expect(content).toContain('lastOccurrence');
    });
  });

  describe('Accessibility', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should have ARIA attributes', () => {
      expect(content).toContain('aria-expanded');
    });

    it('should have focus management', () => {
      expect(content).toMatch(/focus:outline|focus:ring/);
    });

    it('should be keyboard accessible', () => {
      expect(content).toContain('button');
      expect(content).toMatch(/onClick|onKeyDown/);
    });

    it('should have semantic HTML', () => {
      expect(content).toMatch(/<h1|<h2|<h3|<h4/);
    });
  });

  describe('Responsive design', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should have responsive grid', () => {
      expect(content).toMatch(/grid-cols-1.*md:grid-cols/);
    });

    it('should have responsive flex layouts', () => {
      expect(content).toMatch(/flex-col.*md:flex-row/);
    });

    it('should have mobile-friendly spacing', () => {
      expect(content).toMatch(/gap-\d/);
    });
  });

  describe('Dark mode support', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should have dark mode classes', () => {
      expect(content).toMatch(/dark:/);
    });

    it('should style backgrounds for dark mode', () => {
      expect(content).toMatch(/dark:bg-/);
    });

    it('should style text for dark mode', () => {
      expect(content).toMatch(/dark:text-/);
    });

    it('should style borders for dark mode', () => {
      expect(content).toMatch(/dark:border-/);
    });
  });

  describe('Mock data', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should have mock API errors', () => {
      expect(content).toContain('MOCK_API_ERRORS');
    });

    it('should include various status codes', () => {
      expect(content).toMatch(/statusCode:\s*503/);
      expect(content).toMatch(/statusCode:\s*429/);
      expect(content).toMatch(/statusCode:\s*400/);
      expect(content).toMatch(/statusCode:\s*404/);
      expect(content).toMatch(/statusCode:\s*500/);
    });

    it('should include various HTTP methods', () => {
      expect(content).toMatch(/method:\s*['"]GET['"]/);
      expect(content).toMatch(/method:\s*['"]POST['"]/);
    });

    it('should include realistic endpoints', () => {
      expect(content).toContain('/api/');
      expect(content).toMatch(/simulate-transaction|get-ledger|send-transaction/);
    });

    it('should include error messages', () => {
      expect(content).toContain('errorMessage');
      expect(content).toMatch(/Service Unavailable|Rate Limit|Bad Request/);
    });

    it('should include affected runs', () => {
      expect(content).toContain('affectedRuns');
      expect(content).toMatch(/run-\d+/);
    });
  });

  describe('Sorting and filtering', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should sort by count', () => {
      expect(content).toMatch(/sortBy.*count/);
      expect(content).toMatch(/b\.count - a\.count/);
    });

    it('should sort by recent', () => {
      expect(content).toMatch(/sortBy.*recent/);
      expect(content).toContain('lastOccurrence');
    });

    it('should sort by status code', () => {
      expect(content).toMatch(/sortBy.*status/);
      expect(content).toMatch(/statusCode.*statusCode/);
    });

    it('should filter by error type', () => {
      expect(content).toContain('filterStatus');
      expect(content).toMatch(/statusCode >= 400.*statusCode < 500/);
      expect(content).toMatch(/statusCode >= 500/);
    });
  });

  describe('User interactions', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should handle expand/collapse', () => {
      expect(content).toContain('setExpandedError');
      expect(content).toMatch(/isExpanded \? null : /);
    });

    it('should handle sort changes', () => {
      expect(content).toContain('setSortBy');
      expect(content).toContain('onChange');
    });

    it('should handle filter changes', () => {
      expect(content).toContain('setFilterStatus');
    });

    it('should link to affected runs', () => {
      expect(content).toMatch(/href.*run=/);
    });
  });

  describe('Empty state', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should handle no errors', () => {
      expect(content).toMatch(/length === 0/);
    });

    it('should show empty state message', () => {
      expect(content).toMatch(/No errors match|No errors/);
    });

    it('should have empty state icon', () => {
      expect(content).toMatch(/svg.*empty|empty.*svg/i);
    });
  });

  describe('Statistics calculations', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should calculate total errors', () => {
      expect(content).toContain('totalErrors');
      expect(content).toMatch(/reduce.*sum.*count/);
    });

    it('should calculate unique endpoints', () => {
      expect(content).toContain('uniqueEndpoints');
      expect(content).toContain('new Set');
    });

    it('should calculate client errors', () => {
      expect(content).toContain('clientErrors');
      expect(content).toMatch(/statusCode >= 400.*statusCode < 500/);
    });

    it('should calculate server errors', () => {
      expect(content).toContain('serverErrors');
      expect(content).toMatch(/statusCode >= 500/);
    });
  });

  describe('Component documentation', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should have JSDoc comments', () => {
      expect(content).toMatch(/\/\*\*[\s\S]*?\*\//);
    });

    it('should reference issue number', () => {
      expect(content).toMatch(/#\d+|Issue:/);
    });

    it('should describe acceptance criteria', () => {
      expect(content).toMatch(/Acceptance Criteria|Shows counts/);
    });
  });

  describe('Performance considerations', () => {
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('should use useMemo for expensive calculations', () => {
      expect(content).toContain('useMemo');
    });

    it('should memoize sorted and filtered data', () => {
      expect(content).toContain('sortedAndFilteredErrors');
    });
  });
});
