import React, { forwardRef, InputHTMLAttributes, ReactNode, useId } from 'react';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  error?: ReactNode;
  helperText?: ReactNode;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  inputClassName?: string;
  labelClassName?: string;
  wrapperClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    id: customId,
    label,
    error,
    helperText,
    leftIcon,
    rightIcon,
    fullWidth = true,
    required,
    disabled,
    className = '',
    inputClassName = '',
    labelClassName = '',
    wrapperClassName = '',
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
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
            {leftIcon}
          </div>
        )}

        <input
          ref={ref}
          id={id}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`input-field ${leftIcon ? 'pl-9' : ''} ${rightIcon ? 'pr-9' : ''} ${
            error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
          } ${inputClassName} ${className}`}
          {...props}
        />

        {rightIcon && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-zinc-400">
            {rightIcon}
          </div>
        )}
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

export default TextField;
