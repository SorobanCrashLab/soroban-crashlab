'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { FuzzingRun, RunIssueLink } from './types';
import { validateIssueUrl, getIssueTypeFromUrl, addIssueLink, removeIssueLink } from './run-issue-utils';

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
  
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const selectedRun = runs.find(run => run.id === selectedRunId);

  const handleRunSelect = useCallback((runId: string) => {
    setSelectedRunId(runId);
    const run = runs.find(r => r.id === runId);
    setIssueLinks(run?.associatedIssues || []);
    setFormData({ label: '', href: '' });
    setIsAddingIssue(false);
    setError(null);
    setSaveSuccess(false);
  }, [runs]);

  const handleAddIssue = useCallback(() => {
    if (!formData.label.trim() || !formData.href.trim()) return;

    const newIssue: RunIssueLink = {
      label: formData.label.trim(),
      href: formData.href.trim()
    };

    const res = addIssueLink(issueLinks, newIssue);
    if (!res.success) {
      setError(res.error || 'Failed to add issue link');
      return;
    }

    setIssueLinks(res.links);
    setFormData({ label: '', href: '' });
    setIsAddingIssue(false);
    setError(null);
  }, [formData, issueLinks]);

  const handleRemoveIssue = useCallback((index: number) => {
    setIssueLinks(prev => removeIssueLink(prev, index));
    setError(null);
  }, []);

  const handleSaveLinks = useCallback(async () => {
    if (!selectedRunId) return;
    
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    
    try {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          if (Math.random() < 0.05) reject(new Error('Network Error'));
          else resolve(null);
        }, 1200);
      });
      
      onLinkIssue(selectedRunId, issueLinks);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError('Failed to save issue links. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [selectedRunId, issueLinks, onLinkIssue]);

  const handleFormChange = useCallback((field: keyof IssueFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'href' && error === 'Invalid URL format') {
      setError(null);
    }
  }, [error]);

  const isFormValid = formData.label.trim() && formData.href.trim() && validateIssueUrl(formData.href);

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
            <label htmlFor="run-select" className="block text-sm font-medium text-gray-700 mb-2">
              Select Run
            </label>
            <select
              id="run-select"
              value={selectedRunId}
              onChange={(e) => handleRunSelect(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Select a run to manage issues"
            >
              <option value="">Choose a run...</option>
              {runs.map(run => (
                <option key={run.id} value={run.id}>
                  {run.id} - {run.status} - {run.area} - {run.severity}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700" role="alert">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700" role="status">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Issue links saved successfully!
            </div>
          )}

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
                    className="text-sm text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
                    aria-label="Add a new issue link"
                  >
                    + Add Issue
                  </button>
                )}
              </div>

              {isAddingIssue && (
                <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                  <div>
                    <label htmlFor="issue-label" className="block text-sm font-medium text-gray-700 mb-1">
                      Issue Label
                    </label>
                    <input
                      id="issue-label"
                      type="text"
                      value={formData.label}
                      onChange={(e) => handleFormChange('label', e.target.value)}
                      placeholder="e.g., Fix memory leak in auth module"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-required="true"
                    />
                  </div>
                  <div>
                    <label htmlFor="issue-url" className="block text-sm font-medium text-gray-700 mb-1">
                      Issue URL
                    </label>
                    <input
                      id="issue-url"
                      type="url"
                      value={formData.href}
                      onChange={(e) => handleFormChange('href', e.target.value)}
                      placeholder="https://github.com/user/repo/issues/123"
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formData.href && !validateIssueUrl(formData.href)
                          ? 'border-red-300'
                          : 'border-gray-300'
                      }`}
                      aria-required="true"
                      aria-invalid={formData.href && !validateIssueUrl(formData.href) ? 'true' : 'false'}
                    />
                    {formData.href && !validateIssueUrl(formData.href) && (
                      <p className="text-xs text-red-600 mt-1">Please enter a valid URL (http/https)</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddIssue}
                      disabled={!isFormValid}
                      className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingIssue(false);
                        setFormData({ label: '', href: '' });
                        setError(null);
                      }}
                      className="px-3 py-1 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2" role="list">
                {issueLinks.length === 0 && !isAddingIssue && (
                  <p className="text-sm text-gray-500 italic">No issues linked yet</p>
                )}
                {issueLinks.map((issue, index) => (
                  <div key={index} role="listitem" className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
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
                        aria-label={`Open link to ${issue.label}`}
                      >
                        {issue.href}
                      </a>
                    </div>
                    <button
                      onClick={() => handleRemoveIssue(index)}
                      className="ml-2 text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                      aria-label={`Remove issue link ${issue.label}`}
                      title="Remove issue"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {issueLinks.length > 0 && (
                <div className="flex justify-end mt-4">
                  <button
                    onClick={handleSaveLinks}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 ${
                      isSaving ? 'bg-green-400 cursor-not-allowed text-white' : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {isSaving && (
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    {isSaving ? 'Saving...' : 'Save Changes'}
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
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>Link to GitHub, GitLab, Jira, or Linear</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Track bug fixes and improvements</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
