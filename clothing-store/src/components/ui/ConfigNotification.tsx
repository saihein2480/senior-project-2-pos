'use client';

import { isFirebaseConfigured } from '@/lib/firebase';

export default function ConfigNotification() {
  if (isFirebaseConfigured) {
    return null;
  }

  return (
    <div className="border border-gray-300 p-4 mb-6">
      <p className="text-sm text-gray-700">
        <strong>Firebase Configuration Required:</strong> To use authentication features, please set up your Firebase configuration. 
        Check the <code className="bg-gray-100 px-1">SETUP.md</code> file for detailed instructions.
      </p>
    </div>
  );
}
