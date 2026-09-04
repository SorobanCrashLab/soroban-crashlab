import React, { forwardRef, ReactNode, useId } from 'react';

export interface ToggleProps {
  id?: string;
  name?: string;
  label?: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
  labelClassName?: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
  {
    id: customId,
    name,
    label,
    description,
    checked,
    onChange,
    disabled = false,
    size = 'md',
    ariaLabel,
    className = '',
    labelClassName = '',
  },
  ref
) {
  const generatedId = useId();
  const id = customId || generatedId;

  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const isSmall = size === 'sm';
  const trackSize = isSmall ? 'h-5 w-9' : 'h-6 w-11';
  const thumbSize = isSmall ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const thumbTranslate = isSmall
    ? checked ? 'translate-x-4' : 'translate-x-1'
    : checked ? 'translate-x-6' : 'translate-x-1';

  return (
    <div className={`flex-between gap-3 ${className}`}>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <label
              htmlFor={id}
              onClick={handleToggle}
              className={`text-sm-medium cursor-pointer text-zinc-900 dark:text-zinc-100 ${
                disabled ? 'opacity-50 cursor-not-allowed' : ''
              } ${labelClassName}`}
            >
              {label}
            </label>
          )}
          {description && (
            <span className="text-xs text-meta mt-0.5">
              {description}
            </span>
          )}
        </div>
      )}

      <button
        ref={ref}
        id={id}
        name={name}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
        disabled={disabled}
        onClick={handleToggle}
        className={`relative inline-flex ${trackSize} shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        } ${
          checked ? 'bg-[#0A66C2]' : 'bg-zinc-300 dark:bg-zinc-600'
        }`}
      >
        <span
          className={`inline-block ${thumbSize} transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${thumbTranslate}`}
        />
      </button>
    </div>
  );
});

export default Toggle;
