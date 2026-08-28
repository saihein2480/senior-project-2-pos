import React from 'react';
import { X } from 'lucide-react';

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
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-cyan-50 border-blue-200 text-blue-800',
  };

  const iconClasses = {
    error: 'text-red-400',
    success: 'text-green-400',
    warning: 'text-yellow-400',
    info: 'text-blue-400',
  };

  return (
    <div className={`border rounded-lg p-4 ${typeClasses[type]} ${className}`}>
      <div className="flex">
        <div className="flex-1">
          {title && (
            <h3 className="text-sm font-medium mb-1">{title}</h3>
          )}
          <p className="text-sm">{message}</p>
        </div>
        {onClose && (
          <button title='close-alert'
            onClick={onClose}
            className={`ml-3 inline-flex rounded-md p-1.5 hover:bg-opacity-20 focus:outline-none focus:ring-2 focus:ring-offset-2 ${iconClasses[type]}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
