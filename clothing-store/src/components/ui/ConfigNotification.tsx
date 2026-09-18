'use client';

import { isFirebaseConfigured } from '@/lib/firebase';

export default function ConfigNotification() {
  if (isFirebaseConfigured) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
      <strong>Setup needed:</strong> Firebase configuration is missing. 
      Check <code className="bg-white px-2 py-1 rounded border border-yellow-200 font-mono text-xs">SETUP.md</code> for help.
    </div>
  );
}
