import React, { forwardRef, SelectHTMLAttributes, ReactNode, useId } from 'react';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: ReactNode;
  helperText?: ReactNode;
  options?: SelectOption[];
  placeholder?: string;
  fullWidth?: boolean;
  selectClassName?: string;
  labelClassName?: string;
  wrapperClassName?: string;
  children?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    id: customId,
    label,
    error,
    helperText,
    options,
    placeholder,
    fullWidth = true,
    required,
    disabled,
    className = '',
    selectClassName = '',
    labelClassName = '',
    wrapperClassName = '',
    children,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const id = customId || generatedId;
  const errorId = error ? `${id}-error` : undefined;
  const helperId = helperText ? `${id}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`${fullWidth ? 'w-full' : 'inline-block'} ${wrapperClassName}`}>
      {label && (
        <label htmlFor={id} className={`input-label flex-between ${labelClassName}`}>
          <span>
            {label}
            {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
          </span>
        </label>
      )}

      <div className="relative mt-1">
        <select
          ref={ref}
          id={id}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`input-field pr-8 appearance-none cursor-pointer ${
            error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
          } ${selectClassName} ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>

        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-zinc-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-xs mt-1 text-red-600 dark:text-red-400 font-medium">
          {error}
        </p>
      )}

      {!error && helperText && (
        <p id={helperId} className="text-xs mt-1 text-meta">
          {helperText}
        </p>
      )}
    </div>
  );
});

export default Select;
