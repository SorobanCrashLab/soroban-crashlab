// WIP scaffold for issue #2278. Key uniqueness validation not implemented yet.
"use client";

export interface KeyValuePair {
  key: string;
  value: string;
}

export function KeyValueField({
  pairs,
  onChange,
}: {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
}) {
  function update(index: number, field: keyof KeyValuePair, value: string) {
    const next = pairs.map((pair, i) => (i === index ? { ...pair, [field]: value } : pair));
    onChange(next);
  }

  return (
    <div className="key-value-field">
      {pairs.map((pair, index) => (
        <div key={index} className="key-value-field__row">
          <input
            aria-label="Key"
            value={pair.key}
            onChange={(event) => update(index, "key", event.target.value)}
          />
          <input
            aria-label="Value"
            value={pair.value}
            onChange={(event) => update(index, "value", event.target.value)}
          />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...pairs, { key: "", value: "" }])}>
        Add pair
      </button>
    </div>
  );
}
