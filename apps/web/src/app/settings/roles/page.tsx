'use client';

import { useState, useEffect } from 'react';

interface RoleAssignment {
  id: string;
  identityType: 'github' | 'api-key';
  identityValue: string;
  role: 'analyst' | 'maintainer';
  createdAt: string;
  updatedAt: string;
}

interface AuditLog {
  id: string;
  timestamp: string;
  action: 'assign' | 'revoke' | 'update';
  identityType: 'github' | 'api-key';
  identityValue: string;
  previousRole?: string;
  newRole?: string;
  performedBy?: string;
}

export default function RoleManagementPage() {
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [newIdentityType, setNewIdentityType] = useState<'github' | 'api-key'>('github');
  const [newIdentityValue, setNewIdentityValue] = useState('');
  const [newRole, setNewRole] = useState<'analyst' | 'maintainer'>('analyst');

  useEffect(() => {
    async function fetchData() {
      try {
        const [assignRes, auditRes] = await Promise.all([
          fetch('/api/settings/roles'),
          fetch('/api/settings/roles/audit'),
        ]);

        if (assignRes.ok) {
          const data = await assignRes.json();
          setAssignments(data.assignments || []);
        }

        if (auditRes.ok) {
          const data = await auditRes.json();
          setAuditLogs(data.logs || []);
        }
      } catch (err) {
        console.error('Failed to fetch role data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  async function handleAssignRole(e: React.FormEvent) {
    e.preventDefault();
    if (!newIdentityValue.trim()) return;

    try {
      const res = await fetch('/api/settings/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityType: newIdentityType,
          identityValue: newIdentityValue.trim(),
          role: newRole,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAssignments((prev) => {
          const existing = prev.findIndex(
            (a) => a.identityType === newIdentityType && a.identityValue === newIdentityValue
          );
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = data.assignment;
            return updated;
          }
          return [...prev, data.assignment];
        });
        setNewIdentityValue('');
      }
    } catch (err) {
      console.error('Failed to assign role:', err);
    }
  }

  async function handleRevokeRole(identityType: string, identityValue: string) {
    try {
      await fetch('/api/settings/roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityType, identityValue }),
      });

      setAssignments((prev) =>
        prev.filter(
          (a) => !(a.identityType === identityType && a.identityValue === identityValue)
        )
      );
    } catch (err) {
      console.error('Failed to revoke role:', err);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  const maintainerCount = assignments.filter((a) => a.role === 'maintainer').length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Role Management</h1>
        <p className="text-gray-600">Manage RBAC assignments and audit trail</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold">Assign Role</h2>
        <form onSubmit={handleAssignRole} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Identity Type</label>
              <select
                value={newIdentityType}
                onChange={(e) => setNewIdentityType(e.target.value as 'github' | 'api-key')}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="github">GitHub</option>
                <option value="api-key">API Key</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Identity Value</label>
              <input
                type="text"
                value={newIdentityValue}
                onChange={(e) => setNewIdentityValue(e.target.value)}
                placeholder={newIdentityType === 'github' ? 'username' : 'key_id'}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'analyst' | 'maintainer')}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="analyst">Analyst</option>
                <option value="maintainer">Maintainer</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Assign Role
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Current Assignments ({assignments.length})</h2>
        <div className="text-sm text-gray-600 mb-4">
          Active Maintainers: <strong>{maintainerCount}</strong>
        </div>
        {assignments.length === 0 ? (
          <p className="text-gray-500">No role assignments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-2 px-4">Identity Type</th>
                  <th className="text-left py-2 px-4">Identity</th>
                  <th className="text-left py-2 px-4">Role</th>
                  <th className="text-left py-2 px-4">Assigned</th>
                  <th className="text-left py-2 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={`${a.identityType}:${a.identityValue}`} className="border-b">
                    <td className="py-2 px-4">{a.identityType}</td>
                    <td className="py-2 px-4 font-mono text-xs">{a.identityValue}</td>
                    <td className="py-2 px-4">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          a.role === 'maintainer'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {a.role}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-xs text-gray-500">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-4">
                      <button
                        onClick={() => handleRevokeRole(a.identityType, a.identityValue)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Audit Log (Recent {Math.min(auditLogs.length, 20)})</h2>
        {auditLogs.length === 0 ? (
          <p className="text-gray-500">No audit events yet.</p>
        ) : (
          <div className="space-y-3">
            {auditLogs.slice(0, 20).map((log) => (
              <div key={log.id} className="border-l-4 border-gray-300 pl-4 py-2 text-sm">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                    {log.identityValue}
                  </span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      log.action === 'revoke'
                        ? 'bg-red-100 text-red-800'
                        : log.action === 'assign'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {log.action.toUpperCase()}
                  </span>
                </div>
                <div className="text-gray-600">
                  {log.action === 'assign' && `Assigned as ${log.newRole}`}
                  {log.action === 'revoke' && `Revoked from ${log.previousRole}`}
                  {log.action === 'update' && `Updated from ${log.previousRole} to ${log.newRole}`}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(log.timestamp).toLocaleString()}
                  {log.performedBy && ` by ${log.performedBy}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
