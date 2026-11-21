// WIP scaffold for issue #2278.
"use client";

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const inputId = `field-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="form-field">
      <label htmlFor={inputId}>{label}</label>
      <select id={inputId} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
