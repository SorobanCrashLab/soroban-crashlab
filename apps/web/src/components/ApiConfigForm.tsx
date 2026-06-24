'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ApiConfig,
  ValidationErrors,
  DEFAULT_CONFIG,
  loadFromStorage,
  validateConfig,
  saveToStorage,
  resetStorage,
} from '../app/settings/api/api-config-utils';

export default function ApiConfigForm() {
  const [config, setConfig] = useState<ApiConfig>(() =>
    typeof window === 'undefined' ? DEFAULT_CONFIG : loadFromStorage(),
  );
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  const handleChange = useCallback(
    (field: keyof ApiConfig, value: string) => {
      const numericFields: (keyof ApiConfig)[] = ['rateLimitMaxRequests', 'rateLimitWindowSeconds'];
      const updated: ApiConfig = {
        ...config,
        [field]: numericFields.includes(field) ? (value === '' ? 0 : parseInt(value, 10)) : value,
      };
      setConfig(updated);
      setSaved(false);

      const newErrors = validateConfig(updated);
      setErrors((prev) => ({ ...prev, [field]: newErrors[field] }));
    },
    [config],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const newErrors = validateConfig(config);
      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) return;

      if (saveToStorage(config)) {
        setSaved(true);
      } else {
        setErrors({ backendUrl: 'Failed to save configuration. Storage may be unavailable.' });
      }
    },
    [config],
  );

  const handleReset = useCallback(() => {
    resetStorage();
    setConfig(DEFAULT_CONFIG);
    setErrors({});
    setSaved(false);
  }, []);

  const isConfigured = mounted && config.backendUrl.trim() !== '';
  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-page">API Configuration</h1>
        <p className="text-meta mt-1">
          Configure the backend API connection and rate limiting behaviour.
        </p>
      </div>

      {mounted && (
        <div
          className="card card-padding flex items-start gap-3"
          style={{
            borderLeft: `3px solid ${isConfigured ? '#057642' : '#C37D16'}`,
          }}
        >
          <div
            className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
            style={{ background: isConfigured ? '#057642' : '#C37D16' }}
          />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {isConfigured ? 'API configured' : 'API not configured'}
            </p>
            <p className="text-meta text-xs mt-0.5">
              {isConfigured
                ? `Connected to ${config.backendUrl}`
                : 'No backend URL set. The app is using mock data.'}
            </p>
          </div>
        </div>
      )}

      <form
        id="api-config-form"
        onSubmit={handleSubmit}
        noValidate
        className="card card-padding space-y-5"
      >
        <div>
          <label htmlFor="api-backend-url" className="input-label">
            Backend API URL
          </label>
          <input
            id="api-backend-url"
            type="url"
            className="input-field mt-1"
            placeholder="https://api.example.com"
            value={config.backendUrl}
            onChange={(e) => handleChange('backendUrl', e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {errors.backendUrl && (
            <p className="text-xs mt-1" style={{ color: '#CC1016' }}>
              {errors.backendUrl}
            </p>
          )}
          <p className="text-meta text-xs mt-1">
            Leave blank to continue using mock data.
          </p>
        </div>

        <div className="divider" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="api-rate-limit-max" className="input-label">
              Rate Limit — Max Requests
            </label>
            <input
              id="api-rate-limit-max"
              type="number"
              min={1}
              step={1}
              className="input-field mt-1"
              placeholder="100"
              value={config.rateLimitMaxRequests || ''}
              onChange={(e) => handleChange('rateLimitMaxRequests', e.target.value)}
            />
            {errors.rateLimitMaxRequests && (
              <p className="text-xs mt-1" style={{ color: '#CC1016' }}>
                {errors.rateLimitMaxRequests}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="api-rate-limit-window" className="input-label">
              Rate Limit — Window (seconds)
            </label>
            <input
              id="api-rate-limit-window"
              type="number"
              min={1}
              step={1}
              className="input-field mt-1"
              placeholder="60"
              value={config.rateLimitWindowSeconds || ''}
              onChange={(e) => handleChange('rateLimitWindowSeconds', e.target.value)}
            />
            {errors.rateLimitWindowSeconds && (
              <p className="text-xs mt-1" style={{ color: '#CC1016' }}>
                {errors.rateLimitWindowSeconds}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            id="api-config-reset"
            onClick={handleReset}
            className="btn-outline"
            style={{ height: '36px', fontSize: '14px', padding: '0 16px' }}
          >
            Reset to defaults
          </button>

          <div className="flex items-center gap-3">
            {saved && (
              <span
                id="api-config-saved-indicator"
                className="text-sm font-semibold"
                style={{ color: '#057642' }}
              >
                Saved
              </span>
            )}
            <button
              type="submit"
              id="api-config-save"
              className="btn-primary"
              disabled={hasErrors}
              style={{ height: '36px', fontSize: '14px', padding: '0 20px' }}
            >
              Save configuration
            </button>
          </div>
        </div>
      </form>

      <div className="card card-padding">
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          Current Configuration
        </h3>
        {mounted ? (
          <div className="space-y-2">
            {[
              { label: 'Backend URL', value: config.backendUrl || 'Not set' },
              { label: 'Max Requests', value: String(config.rateLimitMaxRequests) },
              { label: 'Window', value: `${config.rateLimitWindowSeconds}s` },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-1">
                <span className="text-meta">{row.label}</span>
                <span
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-5 rounded" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
