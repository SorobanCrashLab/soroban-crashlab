// WIP scaffold for issue #2278.
"use client";

export function TextField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const inputId = `field-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="form-field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
      />
      {error ? (
        <span id={`${inputId}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
