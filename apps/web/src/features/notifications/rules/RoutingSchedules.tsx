'use client';

/**
 * RoutingSchedules — manages on-call rotation shifts, quiet-hours suppression
 * rules, temporary responder overrides, and maintenance windows (#2316).
 */

import React, { useState } from 'react';
import {
  resolveActiveOnCallResponder,
  type RoutingSchedule,
} from '@/app/api/escalation-policies/route';
import type { MaintenanceWindow } from '@/app/api/notification-rules/route';

export interface RoutingSchedulesProps {
  schedules: readonly RoutingSchedule[];
  maintenanceWindows: readonly MaintenanceWindow[];
  onAddOverride: (input: {
    scheduleId: string;
    responder: string;
    reason: string;
  }) => Promise<void>;
  onUpdateQuietHours: (input: {
    scheduleId: string;
    enabled: boolean;
    startHourUtc: number;
    endHourUtc: number;
    allowCriticalBypass: boolean;
  }) => Promise<void>;
  onToggleMaintenanceWindow: (id: string, active: boolean) => Promise<void>;
}

export function RoutingSchedules({
  schedules,
  maintenanceWindows,
  onAddOverride,
  onUpdateQuietHours,
  onToggleMaintenanceWindow,
}: RoutingSchedulesProps) {
  const primarySchedule = schedules[0];
  const [overrideResponder, setOverrideResponder] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!primarySchedule || !overrideResponder.trim()) return;
    await onAddOverride({
      scheduleId: primarySchedule.id,
      responder: overrideResponder.trim(),
      reason: overrideReason.trim() || 'On-call shift coverage swap',
    });
    setOverrideResponder('');
    setOverrideReason('');
  };

  return (
    <div className="space-y-6" data-testid="routing-schedules-view">
      {/* On-Call Schedules & Rotation Matrix */}
      <section aria-labelledby="sched-rotation-heading" className="card card-padding space-y-4">
        <div>
          <h2 id="sched-rotation-heading" className="heading-section mb-1">
            On-call schedules &amp; responder rotations
          </h2>
          <p className="text-meta">
            Schedule-aware routing resolves current primary and backup responders across timezones and active shift overrides.
          </p>
        </div>

        {schedules.map((sched) => {
          const resolved = resolveActiveOnCallResponder(sched);
          return (
            <div
              key={sched.id}
              className="rounded-xl border border-[var(--border-color)] p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-mono text-xs text-meta">
                    {sched.id} · Timezone: {sched.timezone}
                  </span>
                  <h3 className="text-sm font-semibold">{sched.name}</h3>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-[var(--border-color)] px-3 py-1 font-mono">
                    Active On-Call: <strong>{resolved.responder}</strong> ({resolved.source})
                  </span>
                  <span className="rounded-full border border-[var(--border-color)] px-3 py-1 font-mono">
                    Backup: {sched.backupOnCall}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">Weekly rotation shifts for {sched.name}</caption>
                  <thead>
                    <tr className="border-b border-[var(--border-color)] text-left">
                      <th scope="col" className="py-1.5 pr-3">Shift window</th>
                      <th scope="col" className="py-1.5 pr-3">Primary responder</th>
                      <th scope="col" className="py-1.5">Secondary backup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sched.rotations.map((rot) => (
                      <tr key={rot.dayOfWeek} className="border-b border-[var(--border-color)]">
                        <th scope="row" className="py-1.5 pr-3 font-medium text-left">
                          {rot.dayOfWeek}
                        </th>
                        <td className="py-1.5 pr-3 font-mono">{rot.primaryResponder}</td>
                        <td className="py-1.5 font-mono">{rot.secondaryResponder}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Quiet Hours Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-color)]">
                <div className="text-xs">
                  <strong>Quiet Hours ({sched.timezone}):</strong>{' '}
                  {sched.quietHours.startHourUtc}:00 to {sched.quietHours.endHourUtc}:00 UTC ·{' '}
                  {sched.quietHours.allowCriticalBypass
                    ? 'Critical alerts bypass quiet hours'
                    : 'All alerts queued until morning digest'}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void onUpdateQuietHours({
                      scheduleId: sched.id,
                      enabled: !sched.quietHours.enabled,
                      startHourUtc: sched.quietHours.startHourUtc,
                      endHourUtc: sched.quietHours.endHourUtc,
                      allowCriticalBypass: sched.quietHours.allowCriticalBypass,
                    })
                  }
                  className="btn-outline text-xs px-3 py-1"
                >
                  {sched.quietHours.enabled ? 'Disable quiet hours' : 'Enable quiet hours'}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {/* Temporary Schedule Overrides */}
      <section aria-labelledby="sched-overrides-heading" className="card card-padding space-y-4">
        <div>
          <h2 id="sched-overrides-heading" className="heading-section mb-1">
            Temporary on-call overrides
          </h2>
          <p className="text-meta">
            Assign temporary shift coverage without altering the baseline weekly rotation.
          </p>
        </div>

        <form onSubmit={handleOverrideSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block text-xs font-medium space-y-1">
            <span>Replacement responder handle</span>
            <input
              type="text"
              value={overrideResponder}
              onChange={(e) => setOverrideResponder(e.target.value)}
              placeholder="e.g., elena.maint"
              className="form-input w-full"
              required
            />
          </label>
          <label className="block text-xs font-medium space-y-1">
            <span>Override reason</span>
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g., PTO / timezone handoff"
              className="form-input w-full"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary text-xs px-4 py-2 w-full sm:w-auto">
              Add schedule override
            </button>
          </div>
        </form>

        {primarySchedule && primarySchedule.overrides.length > 0 && (
          <ul className="space-y-2 text-xs pt-2">
            {primarySchedule.overrides.map((ov) => (
              <li
                key={ov.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] p-2.5"
              >
                <span>
                  <strong className="font-mono">{ov.responder}</strong> — {ov.reason}
                </span>
                <span className="font-mono text-meta">
                  {ov.startIso.slice(0, 10)} → {ov.endIso.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Maintenance Windows */}
      <section aria-labelledby="sched-maintenance-heading" className="card card-padding space-y-4">
        <div>
          <h2 id="sched-maintenance-heading" className="heading-section mb-1">
            Maintenance windows ({maintenanceWindows.length})
          </h2>
          <p className="text-meta">
            Suppress noisy non-actionable notifications from specified sources during planned upgrades or re-indexing.
          </p>
        </div>

        <div className="space-y-2">
          {maintenanceWindows.map((mw) => (
            <div
              key={mw.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] p-3"
            >
              <div className="text-xs space-y-0.5">
                <div className="font-semibold">
                  {mw.label}{' '}
                  <span className="font-mono text-meta">({mw.id})</span>
                </div>
                <div className="text-meta">
                  Suppressed sources: <span className="font-mono">{mw.suppressSources.join(', ')}</span>
                </div>
              </div>
              <button
                type="button"
                aria-pressed={mw.active}
                onClick={() => void onToggleMaintenanceWindow(mw.id, !mw.active)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  mw.active
                    ? 'border-[#0A66C2] bg-[#0A66C2] text-white'
                    : 'border-[var(--border-color)]'
                }`}
              >
                {mw.active ? 'Active (Suppressing)' : 'Inactive'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
export default RoutingSchedules;
