/**
 * Mock Jira issue data for testing
 */

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
  url: string;
}

export const mockJiraIssue: JiraIssue = {
  key: 'CRASH-123',
  summary: 'Fix segmentation fault in contract execution',
  status: 'In Progress',
  assignee: 'developer@example.com',
  url: 'https://jira.example.com/browse/CRASH-123',
};

export const mockJiraIssueUnassigned: JiraIssue = {
  key: 'CRASH-456',
  summary: 'Investigate memory leak in fuzzer',
  status: 'Open',
  assignee: null,
  url: 'https://jira.example.com/browse/CRASH-456',
};
