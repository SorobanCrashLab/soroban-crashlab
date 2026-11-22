# User Guide

This guide covers every page and feature in the Soroban CrashLab web dashboard. The dashboard has 37 pages organized into several sections. All pages work with mock data by default so you can explore everything without a backend.

---

## Dashboard

The dashboard is the home page when you open the application. It shows a summary of your fuzzing campaign activity.

**What you see here**
- Total run count and status breakdown
- Recent runs table with quick access to details
- Quick action links to other sections
- Failure signature clusters summary
- Resource fee insights for recent campaigns

The dashboard layout is customizable. If you have maintainer mode enabled, you can reorder sections and toggle visibility using the layout editor.

---

## Runs

The runs section lists all fuzzing campaigns with detailed information about each one.

### Run List

The main runs page shows a table with every campaign. You can sort by any column and filter by status, area, severity, or tags. Each row shows the run ID, status badge, area, tags, and key metrics.

Click any row to open the run detail page.

### Run Detail

The run detail page gives you a complete view of a single campaign. It includes:

- **Status timeline** showing how the run progressed over time
- **Crash details** with failure signatures and stack traces
- **Resource metrics** showing fee consumption and budget usage
- **Artifacts** generated during the run that you can download
- **Annotations** that you can add to document findings
- **Tags** for categorizing the run
- **Issue links** connecting crashes to external tracking systems
- **Replay controls** to rerun the campaign and verify reproducibility

### Bulk Actions

Select multiple runs from the list to perform batch operations like tagging, annotating, or exporting.

### Query Builder

The query page lets you construct advanced filters using multiple conditions combined with AND or OR logic.

---

## Analytics

The analytics hub provides visual insights into your fuzzing campaigns.

### Overview

The main analytics page shows summary statistics and quick links to specialized views.

### Failure Clusters

Crashes are automatically grouped by their failure signature. This page shows you which failure patterns are most common so you can prioritize the ones that matter.

### Comparison

Select two or more runs to compare them side by side. The comparison view shows differences in status, resource usage, crash counts, and failure signatures.

### Calendar

A heatmap calendar view that shows campaign activity over time. Darker cells indicate more runs or more failures on that date.

### Heatmap

A detailed heatmap that visualizes failure density across different areas and severity levels.

### Flaky Detection

This page lists crashes that were detected as flaky meaning they could not be reliably reproduced. Flaky results are separated from stable failures to reduce noise in your triage workflow.

---

## Triage

The triage section helps you organize and act on failures.

### Triage Board

A drag and drop board where you can move failures between columns like New, Investigating, Confirmed, and Resolved. Each card shows the failure signature, affected area, severity, and related run count.

### Board View

An alternative layout that shows the full triage board with all columns visible at once.

---

## Trends

The trends page visualizes how your campaigns are performing over time. It shows charts for:

- Crash rates over time
- Resource fee trends
- Campaign duration patterns
- Failure category distribution changes

Use the time range selector to zoom in on specific periods.

---

## Logs

The log viewer displays real time log entries from the fuzzing engine. You can filter by severity level, search for specific text, and view detailed log entries with timestamps.

The viewer supports automatic scrolling for new entries and color coded severity badges to make important messages stand out.

---

## Integrations

The integrations hub lists all available external service connections. Each integration has its own configuration page.

### Available Integrations

| Integration | Purpose |
|---|---|
| Sentry | Error reporting and crash tracking |
| PagerDuty | Alerting for critical failures |
| Prometheus | Metrics export for monitoring |
| Discord | Webhook notifications |
| Slack | Team notifications |
| Webhooks | Custom HTTP callbacks |
| GitHub Issues | Link crashes to GitHub issues |
| Jira | Link crashes to Jira tickets |
| Linear | Link crashes to Linear issues |
| SMTP Email | Email notifications |
| Datadog | Metrics export to Datadog |

Each integration page shows the connection status, configuration form, and test connection button. Integration adapters follow a consistent pattern and work with mock data when the external service is not available.

---

## Settings

The settings section lets you configure the application.

### General Settings

- Theme toggle between light and dark mode
- Accessibility options for reduced motion and contrast
- Maintainer mode toggle that unlocks advanced features

### Alerting

Configure alert rules that trigger when crash rates spike, resource usage exceeds thresholds, or consecutive failures are detected. Each rule can be assigned to specific notification channels.

### Notification Channels

Set up email, Slack, webhook, or SMS channels for receiving alerts.

### API Configuration

View and manage API connection settings including the backend URL and mock data toggle.

### Reporting

Configure report templates for sharing campaign results.

### Presets

Create and manage alerting presets that can be applied to multiple campaigns.

---

## Maintainer Mode

Maintainer mode unlocks advanced features for project administrators. Enable it in Settings.

**Extra features available in maintainer mode**
- Dashboard layout editor for reordering sections
- System monitoring with health metrics
- Conflict of interest policy management
- SLA tracking for response times
- Advanced configuration options

---

## Theme and Appearance

The dashboard supports two visual themes.

**Light mode** uses the Navy Professional color scheme with a clean white background and blue accent colors. It is designed for everyday use in well lit environments.

**Dark mode** uses a dark background with adjusted contrast levels. It is designed for low light environments and matches the aesthetic of developer tools.

You can switch between themes using the toggle in the navigation bar or in Settings. Your preference is saved to local storage and persists across sessions.
