import React, { useState } from 'react';

import {
  getStoredAnalyticsConsent,
  setStoredAnalyticsConsent
} from '../../../../../../packages/web-core/src/observability/analyticsClient.js';

export function ConsentBanner({ onConsentChange }) {
  const [visible, setVisible] = useState(() => getStoredAnalyticsConsent() === null);

  const respond = (granted) => {
    setStoredAnalyticsConsent(granted);
    setVisible(false);
    onConsentChange?.(granted);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          We use analytics cookies to understand how DGFY.ph is used and improve the experience.
          See our{' '}
          <a href="/privacy" className="font-medium text-[#1A4E8D] underline">
            Privacy Policy
          </a>{' '}
          for details.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => respond(false)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => respond(true)}
            className="h-10 rounded-lg bg-[#1A4E8D] px-4 text-sm font-medium text-white hover:bg-[#143F73]"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
