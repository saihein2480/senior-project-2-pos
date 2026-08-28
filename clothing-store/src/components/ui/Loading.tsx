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
    sm: 'h-6 w-6',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };

  const containerClasses = fullScreen
    ? 'min-h-screen flex items-center justify-center bg-gray-50'
    : 'flex items-center justify-center p-8';

  return (
    <div className={containerClasses}>
      <div className="text-center">
        <div className={`animate-spin rounded-full border-b-2 border-blue-600 mx-auto ${sizeClasses[size]}`}></div>
        {message && (
          <p className="mt-4 text-gray-600">{message}</p>
        )}
      </div>
    </div>
  );
}
