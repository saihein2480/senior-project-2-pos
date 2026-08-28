import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Toggle({ checked, onChange, disabled = false, className = '' }: ToggleProps) {
  return (
    <button
      title='Toggle'
      type="button"
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2
        ${checked ? 'bg-blue-600' : 'bg-gray-200'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
}
