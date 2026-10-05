import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const messageId = error || helperText ? `${inputId}-message` : undefined;

    const inputClasses = `
      w-full px-4 py-2.5 bg-white border placeholder-gray-400 text-gray-900 rounded-xl shadow-sm
      focus:outline-none focus:ring-4 focus:ring-rose-100 focus:border-rose-400
      disabled:bg-gray-50 disabled:text-gray-500
      transition-all
      ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-gray-200 hover:border-gray-300'}
      ${className}
    `;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-800">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={inputClasses}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          {...props}
        />
        {error && (
          <p id={messageId} className="text-sm text-red-600">{error}</p>
        )}
        {helperText && !error && (
          <p id={messageId} className="text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
