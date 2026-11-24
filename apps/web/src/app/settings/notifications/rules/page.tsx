'use client';

/**
 * /settings/notifications/rules — Notification Rules & Escalation Policy Builder (#2316).
 */

import React from 'react';
import { NotificationRulesBuilder } from '@/features/notifications/rules/NotificationRulesBuilder';

export default function NotificationRulesSettingsPage() {
  return (
    <div className="px-6 md:px-8 max-w-6xl mx-auto w-full py-14 space-y-8">
      <div>
        <h1 className="heading-page">Notification rules &amp; escalation policy builder</h1>
        <p className="text-meta mt-1">
          Orchestrate multi-channel routing (Slack, PagerDuty, webhooks, email, in-app), anti-storm throttling, on-call schedules, tiered escalations, and deterministic delivery simulations.
        </p>
      </div>

      <NotificationRulesBuilder />
    </div>
  );
}
