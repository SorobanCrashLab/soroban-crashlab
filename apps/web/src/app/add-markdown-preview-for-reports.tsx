/**
 * Issue #297 – Add Markdown preview for reports
 *
 * This module re-exports the building blocks that together implement the
 * Markdown preview feature for fuzzing-run reports in the dashboard:
 *
 *  - MarkdownPreview  – renders arbitrary Markdown with react-markdown + remark-gfm
 *  - ReportModal      – full-screen modal wrapping MarkdownPreview with copy/download actions
 *  - generateMarkdownReport – converts a FuzzingRun into a structured Markdown string
 *
 * Usage in the dashboard (apps/web/src/app/page.tsx):
 *   1. Maintain a `reportRun` state (FuzzingRun | null).
 *   2. Pass `onViewReport={setReportRun}` to <RunHistoryTable />.
 *   3. Render <ReportModal> when reportRun is non-null.
 */

export { default as MarkdownPreview } from './MarkdownPreview';
export { default as ReportModal } from './ReportModal';
export { generateMarkdownReport } from './report-utils';
