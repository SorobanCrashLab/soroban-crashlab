export interface GaugeProps {
  value: number;
  min?: number;
  max: number;
  label: string;
  unit?: string;
  thresholds?: { warning?: number; danger?: number };
}

export function Gauge({ value, min = 0, max, label, unit = '', thresholds = {} }: GaugeProps) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    throw new RangeError('Gauge requires finite values and max greater than min');
  }
  const clamped = Math.max(min, Math.min(max, value));
  const percent = ((clamped - min) / (max - min)) * 100;
  const tone = thresholds.danger !== undefined && clamped >= thresholds.danger
    ? 'danger'
    : thresholds.warning !== undefined && clamped >= thresholds.warning
      ? 'warning'
      : 'normal';
  return (
    <div className={`chart-gauge chart-gauge-${tone}`} role="meter" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={clamped}>
      <div className="chart-gauge-track"><span style={{ width: `${percent}%` }} /></div>
      <p><strong>{clamped}{unit}</strong> <span>{label}</span></p>
    </div>
  );
}
