import React from 'react';
import { X, AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

interface AlertProps {
  type?: 'error' | 'success' | 'warning' | 'info';
  title?: string;
  message: string;
  onClose?: () => void;
  className?: string;
}

export function Alert({
  type = 'info',
  title,
  message,
  onClose,
  className = '',
}: AlertProps) {
  const typeClasses = {
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-rose-50 border-rose-200 text-rose-800',
  };

  const iconClasses = {
    error: 'text-red-500',
    success: 'text-green-500',
    warning: 'text-amber-500',
    info: 'text-rose-500',
  };

  const Icon = {
    error: AlertCircle,
    success: CheckCircle2,
    warning: AlertTriangle,
    info: Info,
  }[type];

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`border rounded-xl p-3.5 ${typeClasses[type]} ${className}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 flex-shrink-0 mt-px ${iconClasses[type]}`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          {title && (
            <h3 className="text-sm font-semibold mb-0.5">{title}</h3>
          )}
          <p className="text-sm">{message}</p>
        </div>
        {onClose && (
          <button
            type="button"
            title="Close"
            aria-label="Close"
            onClick={onClose}
            className={`-m-1 inline-flex rounded-lg p-1.5 hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${iconClasses[type]}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
