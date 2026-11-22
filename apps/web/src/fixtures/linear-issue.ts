/**
 * Mock Linear issue data for testing
 */

export interface LinearIssue {
  identifier: string;
  title: string;
  state: string;
  assignee: string | null;
  url: string;
}

export const mockLinearIssue: LinearIssue = {
  identifier: 'CRASH-123',
  title: 'Fix segmentation fault in contract execution',
  state: 'In Progress',
  assignee: 'developer@example.com',
  url: 'https://linear.app/crashlab/issue/CRASH-123',
};

export const mockLinearIssueUnassigned: LinearIssue = {
  identifier: 'CRASH-456',
  title: 'Investigate memory leak in fuzzer',
  state: 'Todo',
  assignee: null,
  url: 'https://linear.app/crashlab/issue/CRASH-456',
};
