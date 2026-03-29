'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { FuzzingRun, RunIssueLink } from './types';

interface RunIssueLinkPageProps {
  runs: FuzzingRun[];
  onLinkIssue: (runId: string, issueLinks: RunIssueLink[]) => void;
  className?: string;
}

interface IssueFormData {
  label: string;
  href: string;
}

const RunIssueLinkPage: React.FC<RunIssueLinkPageProps> = ({
  runs,
  onLinkIssue,
  className = '',
}) => {
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [issueLinks, setIssueLinks] = useState<RunIssueLink[]>([]);
  const [formData, setFormData] = useState<IssueFormData>({
    label: '',
    href: ''
  });
  const [isAddingIssue, setIsAddingIssue] = useState(false);

  const selectedRun = runs.find(run => run.id === selectedRunId);

  const handleRunSelect = useCallback((runId: string) => {
    setSelectedRunId(runId);
    const run = runs.find(r => r.id === runId);
    setIssueLinks(run?.associatedIssues || []);
    setFormData({ label: '', href: '' });
    setIsAddingIssue(false);
  }, [runs]);

  const handleAddIssue = useCallback(() => {
    if (!formData.label.trim() || !formData.href.trim()) return;

    const newIssue: RunIssueLink = {
      label: formData.label.trim(),
      href: formData.href.trim()
    };

    setIssueLinks([...issueLinks, newIssue]);
    setFormData({ label: '', href: '' });
    setIsAddingIssue(false);
  }, [formData, issueLinks]);

  const handleRemoveIssue = useCallback((index: number) => {
    setIssueLinks(issueLinks.filter((_, i) => i !== index));
  }, [issueLinks]);

  const handleSaveLinks = useCallback(() => {
    if (!selectedRunId) return;
    onLinkIssue(selectedRunId, issueLinks);
  }, [selectedRunId, issueLinks, onLinkIssue]);

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleFormChange = useCallback((field: keyof IssueFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const getIssueTypeFromUrl = (url: string): string => {
    if (url.includes('github.com')) return 'GitHub Issue';
    if (url.includes('gitlab.com')) return 'GitLab Issue';
    if (url.includes('jira')) return 'Jira Ticket';
    if (url.includes('linear.app')) return 'Linear Issue';
    return 'External Issue';
  };

  const isFormValid = formData.label.trim() && formData.href.trim() && validateUrl(formData.href);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Run Issue Links</h2>
        <p className="text-sm text-gray-600">
          Link external issues and tickets to fuzzing runs for better tracking and visibility.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Run
            </label>
            <select
              value={selectedRunId}
              onChange={(e) => handleRunSelect(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a run...</option>
              {runs.map(run => (
                <option key={run.id} value={run.id}>
                  {run.id} - {run.status} - {run.area} - {run.severity}
                </option>
              ))}
            </select>
          </div>

          {selectedRun && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Run Details</h4>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-gray-600">ID:</dt>
                  <dd className="font-medium">{selectedRun.id}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">Status:</dt>
                  <dd className="font-medium capitalize">{selectedRun.status}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">Area:</dt>
                  <dd className="font-medium capitalize">{selectedRun.area}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">Severity:</dt>
                  <dd className="font-medium capitalize">{selectedRun.severity}</dd>
                </div>
                {selectedRun.crashDetail && (
                  <div className="col-span-2">
                    <dt className="text-gray-600">Crash Signature:</dt>
                    <dd className="font-medium text-xs break-all">{selectedRun.crashDetail.signature}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {selectedRun && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">Issue Links</h4>
                {!isAddingIssue && (
                  <button
                    onClick={() => setIsAddingIssue(true)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    + Add Issue
                  </button>
                )}
              </div>

              {isAddingIssue && (
                <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Issue Label
                    </label>
                    <input
                      type="text"
                      value={formData.label}
                      onChange={(e) => handleFormChange('label', e.target.value)}
                      placeholder="e.g., Fix memory leak in auth module"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Issue URL
                    </label>
                    <input
                      type="url"
                      value={formData.href}
                      onChange={(e) => handleFormChange('href', e.target.value)}
                      placeholder="https://github.com/user/repo/issues/123"
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formData.href && !validateUrl(formData.href)
                          ? 'border-red-300'
                          : 'border-gray-300'
                      }`}
                    />
                    {formData.href && !validateUrl(formData.href) && (
                      <p className="text-xs text-red-600 mt-1">Please enter a valid URL</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddIssue}
                      disabled={!isFormValid}
                      className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      Add Issue
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingIssue(false);
                        setFormData({ label: '', href: '' });
                      }}
                      className="px-3 py-1 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {issueLinks.length === 0 && !isAddingIssue && (
                  <p className="text-sm text-gray-500 italic">No issues linked yet</p>
                )}
                {issueLinks.map((issue, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                          {getIssueTypeFromUrl(issue.href)}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-gray-900 truncate">{issue.label}</div>
                      <a
                        href={issue.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 truncate block"
                      >
                        {issue.href}
                      </a>
                    </div>
                    <button
                      onClick={() => handleRemoveIssue(index)}
                      className="ml-2 text-red-600 hover:text-red-800"
                      title="Remove issue"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {issueLinks.length > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveLinks}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                  >
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">Quick Actions</h4>
            <div className="space-y-2 text-sm text-blue-800">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>Link to GitHub, GitLab, Jira, or Linear</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Track bug fixes and improvements</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Monitor issue resolution progress</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Recent Issues</h4>
            <div className="space-y-2">
              {runs
                .filter(run => run.associatedIssues && run.associatedIssues.length > 0)
                .slice(0, 5)
                .map(run => (
                  <div key={run.id} className="text-sm">
                    <div className="font-medium text-gray-900">{run.id}</div>
                    <div className="text-gray-600">
                      {run.associatedIssues?.length} issue{run.associatedIssues?.length !== 1 ? 's' : ''} linked
                    </div>
                  </div>
                ))}
              {runs.filter(run => run.associatedIssues && run.associatedIssues.length > 0).length === 0 && (
                <p className="text-sm text-gray-500 italic">No issues linked yet</p>
              )}
            </div>
          </div>

          <div className="bg-yellow-50 p-4 rounded-lg">
            <h4 className="text-sm font-semibold text-yellow-900 mb-2">Tips</h4>
            <ul className="space-y-1 text-sm text-yellow-800">
              <li>• Use descriptive labels for easy identification</li>
              <li>• Link issues that directly relate to the crash</li>
              <li>• Include issue numbers in labels for reference</li>
              <li>• Regularly update issue status</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RunIssueLinkPage;
