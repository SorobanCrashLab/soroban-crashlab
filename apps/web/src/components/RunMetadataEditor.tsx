'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FuzzingRun } from '../app/types';

export interface RunMetadata {
  name: string;
  description: string;
  tags: string[];
}

interface RunMetadataEditorProps {
  run: FuzzingRun;
  onSave: (metadata: RunMetadata) => void;
  isEditing: boolean;
  onToggleEdit: () => void;
}

export default function RunMetadataEditor({
  run,
  onSave,
  isEditing,
  onToggleEdit,
}: RunMetadataEditorProps) {
  const [name, setName] = useState(run.id);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>(run.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Reset local edit state whenever the underlying run identity changes
    // (the editor is reused across runs rather than remounted per-run).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(run.id);
    setTags(run.tags ?? []);
    setSaveState('idle');
    setError(null);
  }, [run.id, run.tags]);

  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditing]);

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (tags.includes(trimmed)) {
      setError('Tag already exists');
      return;
    }
    setTags((prev) => [...prev, trimmed]);
    setTagInput('');
    setError(null);
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
    setError(null);
  }, []);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTag();
      } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
        setTags((prev) => prev.slice(0, -1));
      }
    },
    [addTag, tagInput, tags.length],
  );

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError('Run name is required');
      return;
    }
    setSaveState('saving');
    setError(null);
    try {
      onSave({ name: name.trim(), description: description.trim(), tags });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
      setError('Failed to save metadata. Please try again.');
    }
  }, [name, description, tags, onSave]);

  const handleCancel = useCallback(() => {
    setName(run.id);
    setDescription('');
    setTags(run.tags ?? []);
    setTagInput('');
    setError(null);
    setSaveState('idle');
    onToggleEdit();
  }, [run.id, run.tags, onToggleEdit]);

  if (!isEditing) {
    return (
      <section
        className="mb-8 rounded-xl p-4"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div className="flex-between mb-3">
          <h2
            className="text-lg font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            Run Metadata
          </h2>
          <button
            type="button"
            className="btn-outline text-sm"
            onClick={onToggleEdit}
            data-testid="edit-metadata-toggle"
          >
            Edit
          </button>
        </div>
        <div className="space-y-2">
          <div>
            <span
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Name
            </span>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {run.id}
            </p>
          </div>
          <div>
            <span
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Description
            </span>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No description provided
            </p>
          </div>
          {tags.length > 0 && (
            <div>
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Tags
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      background: 'var(--chip-bg)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      className="mb-8 rounded-xl p-4"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-color)',
      }}
    >
      <div className="flex-between mb-4">
        <h2
          className="text-lg font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          Edit Run Metadata
        </h2>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="run-name"
            className="input-label"
            style={{ color: 'var(--text-secondary)' }}
          >
            Run Name
          </label>
          <input
            ref={nameInputRef}
            id="run-name"
            type="text"
            className="input-field mt-1 w-full"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Auth fuzzing – March 2026"
            data-testid="run-name-input"
          />
        </div>

        <div>
          <label
            htmlFor="run-description"
            className="input-label"
            style={{ color: 'var(--text-secondary)' }}
          >
            Description
          </label>
          <textarea
            id="run-description"
            className="input-field mt-1 w-full"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes about this run..."
            style={{ resize: 'vertical' }}
            data-testid="run-description-input"
          />
        </div>

        <div>
          <label
            htmlFor="tag-input"
            className="input-label"
            style={{ color: 'var(--text-secondary)' }}
          >
            Tags
          </label>
          <div className="mt-1">
            <div
              className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg min-h-[38px]"
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
              }}
              onClick={() => tagInputRef.current?.focus()}
              data-testid="tag-container"
            >
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    background: 'var(--chip-bg)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTag(tag);
                    }}
                    className="hover:opacity-70"
                    aria-label={`Remove tag ${tag}`}
                    data-testid={`remove-tag-${tag}`}
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                ref={tagInputRef}
                id="tag-input"
                type="text"
                className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-sm"
                style={{ color: 'var(--text-primary)' }}
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleTagKeyDown}
                placeholder={tags.length === 0 ? 'Type and press Enter...' : ''}
                data-testid="tag-input"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-xs" style={{ color: '#CC1016' }} data-testid="metadata-error">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          {saveState === 'saved' && (
            <span
              className="text-sm-semibold"
              style={{ color: '#057642' }}
              data-testid="save-success"
            >
              Saved
            </span>
          )}
          <button
            type="button"
            className="btn-outline text-sm"
            onClick={handleCancel}
            data-testid="cancel-edit"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={handleSave}
            disabled={saveState === 'saving'}
            style={{ height: '36px', fontSize: '14px', padding: '0 20px' }}
            data-testid="save-metadata"
          >
            {saveState === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </section>
  );
}
