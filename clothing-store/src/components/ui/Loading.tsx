import React from 'react';

interface LoadingProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
}

export function Loading({ 
  message = 'Loading...', 
  size = 'md', 
  fullScreen = false 
}: LoadingProps) {
  const sizeClasses = {
    sm: 'h-6 w-6 border-2',
    md: 'h-10 w-10 border-[3px]',
    lg: 'h-14 w-14 border-4',
  };

  const containerClasses = fullScreen
    ? 'min-h-screen flex items-center justify-center bg-canvas'
    : 'flex items-center justify-center p-8';

  return (
    <div className={containerClasses} role="status" aria-live="polite">
      <div className="text-center">
        <div
          className={`animate-spin rounded-full border-rose-100 border-t-rose-500 mx-auto ${sizeClasses[size]}`}
          aria-hidden="true"
        ></div>
        {message && (
          <p className="mt-4 text-sm font-medium text-gray-500">{message}</p>
        )}
      </div>
    </div>
  );
}
