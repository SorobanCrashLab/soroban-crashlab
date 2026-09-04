'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiConfig,
  ValidationErrors,
  DEFAULT_CONFIG,
  loadFromStorage,
  validateConfig,
  saveToStorage,
  resetStorage,
  loadDraft,
  saveDraft,
  clearDraft,
  isSameConfig,
  resolveInitialConfig,
} from '../app/settings/api/api-config-utils';
import ConfirmDialog from './ConfirmDialog';
import { getConfirmDialogConfig } from './confirm-dialog-utils';
import { TextField } from './TextField';
import { Button } from './Button';

const numericFields = new Set<keyof ApiConfig>([
  'rateLimitMaxRequests',
  'rateLimitWindowSeconds',
]);

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
    <TextField
      id={id}
      label={label}
      type={type}
      placeholder={placeholder}
      value={value}
      error={error}
      min={min}
      step={step}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function ApiConfigForm() {
  // Mount from the unsaved draft when one exists, so edits survive the browser
  // discarding a backgrounded tab and remounting this form (#1074).
  const [config, setConfig] = useState<ApiConfig>(DEFAULT_CONFIG);

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Latest config, so the visibility/pagehide listeners can flush the final
  // keystrokes without being re-bound on every change.
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    queueMicrotask(() => {
      setConfig(resolveInitialConfig(loadFromStorage(), loadDraft()));
      setMounted(true);
    });
  }, []);

  // Surface the restore so the user understands why the fields aren't the saved
  // values. Checked after mount to keep the server and client markup identical.
  useEffect(() => {
    if (!mounted) return;
    const draft = loadDraft();
    if (draft && !isSameConfig(draft, loadFromStorage())) {
      queueMicrotask(() => setDraftRestored(true));
    }
  }, [mounted]);

  // A discarded tab gets no unmount callback, so mirror pending edits to storage
  // as they happen and flush again the moment the tab is backgrounded.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const flush = () => {
      if (!isSameConfig(configRef.current, loadFromStorage())) {
        saveDraft(configRef.current);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flush);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flush);
    };
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
      setDraftRestored(false);

      // Persist immediately: a tab can be discarded without any further event.
      if (isSameConfig(updated, loadFromStorage())) {
        clearDraft();
      } else {
        saveDraft(updated);
      }

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
        // The draft has been promoted to the saved config; nothing left to restore.
        clearDraft();
        setSaved(true);
        setDraftRestored(false);
        return;
      }

      setErrors({
        backendUrl: 'Failed to save configuration. Storage may be unavailable.',
      });
    },
    [config],
  );

  const handleReset = useCallback(() => {
    setResetConfirmOpen(true);
  }, []);

  const handleResetConfirm = useCallback(() => {
    resetStorage();
    clearDraft();
    setConfig(DEFAULT_CONFIG);
    setErrors({});
    setSaved(false);
    setDraftRestored(false);
    setResetConfirmOpen(false);
  }, []);

  const handleResetCancel = useCallback(() => {
    setResetConfirmOpen(false);
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
            borderLeft: `3px solid ${isConfigured ? '#057642' : '#946210'}`,
          }}
        >
          <div
            className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
            style={{
              background: isConfigured ? '#057642' : '#946210',
            }}
          />

          <div>
            <p
              className="text-sm-semibold"
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
        {draftRestored && (
          <p
            id="api-config-draft-restored"
            className="text-xs"
            role="status"
            style={{ color: '#946210' }}
          >
            Unsaved changes were restored. Save the configuration to apply them.
          </p>
        )}

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

        <div className="flex-between pt-2">
          <Button
            type="button"
            variant="outline"
            id="api-config-reset"
            onClick={handleReset}
            style={{
              height: '36px',
              fontSize: '14px',
              padding: '0 16px',
            }}
          >
            Reset to defaults
          </Button>

          <div className="flex items-center gap-3">
            {saved && (
              <span
                id="api-config-saved-indicator"
                className="text-sm-semibold"
                style={successStyle}
              >
                Saved
              </span>
            )}

            <Button
              id="api-config-save"
              type="submit"
              variant="primary"
              disabled={hasErrors}
              style={{
                height: '36px',
                fontSize: '14px',
                padding: '0 20px',
              }}
            >
              Save configuration
            </Button>
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
                  className="text-sm-medium"
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

      {/* Reset-to-defaults confirmation */}
      {(() => {
        const cfg = getConfirmDialogConfig('reset-config');
        return (
          <ConfirmDialog
            isOpen={resetConfirmOpen}
            title={cfg.title}
            message={cfg.message}
            confirmText={cfg.confirmText}
            cancelText={cfg.cancelText}
            variant={cfg.variant}
            onConfirm={handleResetConfirm}
            onCancel={handleResetCancel}
          />
        );
      })()}
    </div>
  );
}
