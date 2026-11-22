import { RunIssueLink } from './types';

export function validateIssueUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function getIssueTypeFromUrl(url: string): string {
  if (url.includes('github.com')) return 'GitHub Issue';
  if (url.includes('gitlab.com')) return 'GitLab Issue';
  if (url.includes('jira')) return 'Jira Ticket';
  if (url.includes('linear.app')) return 'Linear Issue';
  return 'External Issue';
}

export function getIssueHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function getIssueFaviconUrl(url: string): string | null {
  const hostname = getIssueHostname(url);
  if (!hostname) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
}

export function addIssueLink(links: RunIssueLink[], newLink: RunIssueLink): { success: boolean; links: RunIssueLink[]; error?: string } {
  if (!validateIssueUrl(newLink.href)) {
    return { success: false, links, error: 'Invalid URL format' };
  }
  
  if (links.some(link => link.href === newLink.href)) {
    return { success: false, links, error: 'Issue link already exists' };
  }
  
  return { success: true, links: [...links, newLink] };
}

export function removeIssueLink(links: RunIssueLink[], indexToRemove: number): RunIssueLink[] {
  return links.filter((_, index) => index !== indexToRemove);
}
