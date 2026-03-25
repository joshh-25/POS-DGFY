import React from 'react';
import { AlertTriangle } from 'lucide-react';
import useStore from '../../src/store/useStore.js';

export default function GracePeriodBanner() {
  const { currentUser } = useStore();
  const company = currentUser?.company;

  if (!company || company.subscription_status !== 'past_due') return null;

  const graceEnd = company.grace_period_end
    ? new Date(company.grace_period_end).toLocaleDateString()
    : null;

  return (
    <div className="w-full bg-amber-500 text-white px-4 py-2.5 flex items-center gap-3 text-sm font-medium">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        Payment failed. Update your payment method to avoid service interruption.
        {graceEnd && ` Your access continues until ${graceEnd}.`}
      </span>
    </div>
  );
}
