'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiConfig,
  ValidationErrors,
  DEFAULT_CONFIG,
  loadFromStorage,
  validateConfig,
  saveToStorage,
  resetStorage,
} from '../app/settings/api/api-config-utils';

const numericFields = new Set<keyof ApiConfig>([
  'rateLimitMaxRequests',
  'rateLimitWindowSeconds',
]);

const dangerStyle = { color: '#CC1016' };
const successStyle = { color: '#057642' };

type InputProps = {
  id: string;
  label: string;
  type?: string;
  placeholder: string;
  value: string | number;
  error?: string;
  onChange: (value: string) => void;
  min?: number;
  step?: number;
};

function Field({
  id,
  label,
  type = 'text',
  placeholder,
  value,
  error,
  onChange,
  min,
  step,
}: InputProps) {
  return (
    <div>
      <label htmlFor={id} className="input-label">
        {label}
      </label>

      <input
        id={id}
        type={type}
        className="input-field mt-1"
        placeholder={placeholder}
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.value)}
      />

      {error && (
        <p className="text-xs mt-1" style={dangerStyle}>
          {error}
        </p>
      )}
    </div>
  );
}

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
      const updated = {
        ...config,
        [field]: numericFields.has(field)
          ? value === ''
            ? 0
            : Number(value)
          : value,
      };

      setConfig(updated);
      setSaved(false);

      const validation = validateConfig(updated);
      setErrors((prev) => ({
        ...prev,
        [field]: validation[field],
      }));
    },
    [config],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const validation = validateConfig(config);
      setErrors(validation);

      if (Object.keys(validation).length) return;

      if (saveToStorage(config)) {
        setSaved(true);
        return;
      }

      setErrors({
        backendUrl: 'Failed to save configuration. Storage may be unavailable.',
      });
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
  const hasErrors = useMemo(() => Object.values(errors).some(Boolean), [errors]);

  const currentConfig = useMemo(
    () => [
      {
        label: 'Backend URL',
        value: config.backendUrl || 'Not set',
      },
      {
        label: 'Max Requests',
        value: config.rateLimitMaxRequests,
      },
      {
        label: 'Window',
        value: `${config.rateLimitWindowSeconds}s`,
      },
    ],
    [config],
  );

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
            style={{
              background: isConfigured ? '#057642' : '#C37D16',
            }}
          />

          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
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
        className="card card-padding space-y-5"
        noValidate
        onSubmit={handleSubmit}
      >
        <Field
          id="api-backend-url"
          label="Backend API URL"
          type="url"
          placeholder="https://api.example.com"
          value={config.backendUrl}
          error={errors.backendUrl}
          onChange={(value) => handleChange('backendUrl', value)}
        />

        <p className="text-meta text-xs -mt-3">
          Leave blank to continue using mock data.
        </p>

        <div className="divider" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            id="api-rate-limit-max"
            label="Rate Limit — Max Requests"
            type="number"
            placeholder="100"
            min={1}
            step={1}
            value={config.rateLimitMaxRequests || ''}
            error={errors.rateLimitMaxRequests}
            onChange={(value) => handleChange('rateLimitMaxRequests', value)}
          />

          <Field
            id="api-rate-limit-window"
            label="Rate Limit — Window (seconds)"
            type="number"
            placeholder="60"
            min={1}
            step={1}
            value={config.rateLimitWindowSeconds || ''}
            error={errors.rateLimitWindowSeconds}
            onChange={(value) => handleChange('rateLimitWindowSeconds', value)}
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            className="btn-outline"
            id="api-config-reset"
            onClick={handleReset}
            style={{
              height: '36px',
              fontSize: '14px',
              padding: '0 16px',
            }}
          >
            Reset to defaults
          </button>

          <div className="flex items-center gap-3">
            {saved && (
              <span
                id="api-config-saved-indicator"
                className="text-sm font-semibold"
                style={successStyle}
              >
                Saved
              </span>
            )}

            <button
              id="api-config-save"
              type="submit"
              className="btn-primary"
              disabled={hasErrors}
              style={{
                height: '36px',
                fontSize: '14px',
                padding: '0 20px',
              }}
            >
              Save configuration
            </button>
          </div>
        </div>
      </form>

      <div className="card card-padding">
        <h3
          className="font-semibold text-sm mb-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          Current Configuration
        </h3>

        {mounted ? (
          <div className="space-y-2">
            {currentConfig.map(({ label, value }) => (
              <div
                key={label}
                className="flex justify-between items-center py-1"
              >
                <span className="text-meta">{label}</span>

                <span
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-5 rounded" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
