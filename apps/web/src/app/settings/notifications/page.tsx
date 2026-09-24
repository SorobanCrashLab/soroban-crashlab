'use client';

import { useState, useEffect } from 'react';
import { LoadingSpinner } from '../../../components/LoadingSkeleton';

type DigestFrequency = 'immediate' | 'daily' | 'weekly';
type EventType = 'run_failure' | 'flaky_detection' | 'campaign_completion';

interface NotificationPreference {
  id: string;
  userId: string;
  emailDigestFrequency: DigestFrequency;
  enabledEventTypes: EventType[];
  createdAt: string;
  updatedAt: string;
}

export default function NotificationSettingsRoute() {
  const [loading, setLoading] = useState(true);
  const [preference, setPreference] = useState<NotificationPreference | null>(null);
  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>('immediate');
  const [enabledEvents, setEnabledEvents] = useState<EventType[]>(['run_failure']);

  useEffect(() => {
    async function fetchPreference() {
      try {
        const res = await fetch('/api/settings/notifications');
        if (res.ok) {
          const data = await res.json();
          setPreference(data.preference);
          setDigestFrequency(data.preference.emailDigestFrequency);
          setEnabledEvents(data.preference.enabledEventTypes);
        }
      } catch (err) {
        console.error('Failed to fetch notification preferences:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchPreference();
  }, []);

  async function handleSavePreferences() {
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailDigestFrequency: digestFrequency,
          enabledEventTypes: enabledEvents,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPreference(data.preference);
      }
    } catch (err) {
      console.error('Failed to save notification preferences:', err);
    }
  }

  function toggleEventType(event: EventType) {
    setEnabledEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }

  if (loading) {
    return (
      <div className="px-6 md:px-8 max-w-5xl mx-auto w-full py-14">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="px-6 md:px-8 max-w-5xl mx-auto w-full py-14 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Notification Settings</h1>
        <p className="text-gray-600">Configure how you receive notifications</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Email Digest Frequency</h2>
          <p className="text-sm text-gray-600 mb-4">
            Choose how frequently you want to receive notification digests via email.
          </p>
          <div className="space-y-3">
            {(['immediate', 'daily', 'weekly'] as const).map((freq) => (
              <label key={freq} className="flex items-center">
                <input
                  type="radio"
                  name="digest"
                  value={freq}
                  checked={digestFrequency === freq}
                  onChange={(e) => setDigestFrequency(e.target.value as DigestFrequency)}
                  className="mr-3"
                />
                <span className="capitalize font-medium">
                  {freq === 'immediate' ? 'Immediate (per event)' : `${freq.charAt(0).toUpperCase() + freq.slice(1)} Digest`}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Event Types</h2>
          <p className="text-sm text-gray-600 mb-4">Select which event types should trigger notifications.</p>
          <div className="space-y-3">
            {(['run_failure', 'flaky_detection', 'campaign_completion'] as const).map((event) => (
              <label key={event} className="flex items-center">
                <input
                  type="checkbox"
                  checked={enabledEvents.includes(event)}
                  onChange={() => toggleEventType(event)}
                  className="mr-3"
                />
                <span className="font-medium">
                  {event === 'run_failure' && 'Run Failures'}
                  {event === 'flaky_detection' && 'Flaky Test Detections'}
                  {event === 'campaign_completion' && 'Campaign Completions'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t pt-6 flex gap-3">
          <button
            onClick={handleSavePreferences}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
          >
            Save Preferences
          </button>
          <button
            onClick={() => {
              if (preference) {
                setDigestFrequency(preference.emailDigestFrequency);
                setEnabledEvents(preference.enabledEventTypes);
              }
            }}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
        </div>

        {preference && (
          <div className="border-t pt-6 text-xs text-gray-500">
            <p>Last updated: {new Date(preference.updatedAt).toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}
