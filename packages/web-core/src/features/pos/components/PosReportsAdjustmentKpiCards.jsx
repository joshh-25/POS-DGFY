import { AlertTriangle, CheckCircle2, Clock3, Receipt } from 'lucide-react';
import { PosReportsKpiCard } from './PosReportsKpiCards.jsx';

const money = (value, currencySymbol = '₱') => {
  const symbol = String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol;
  return `${symbol}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function PosReportsAdjustmentKpiCards({ summary = {}, rows = [], currencySymbol = '₱' }) {
  const adjustmentRows = Array.isArray(rows) ? rows : [];
  const reportedCount = Number(summary?.adjustment_count);
  const adjustmentCount = Math.max(
    Number.isFinite(reportedCount) ? reportedCount : 0,
    adjustmentRows.length
  );

  if (adjustmentCount === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4" role="group" aria-label="Adjustment summary">
      <PosReportsKpiCard
        label="Adjustment events"
        value={adjustmentCount.toLocaleString('en-US')}
        Icon={Receipt}
        accent="purple"
      />
      <PosReportsKpiCard
        label="Completed amount"
        value={money(summary?.succeeded_amount, currencySymbol)}
        Icon={CheckCircle2}
        accent="green"
      />
      <PosReportsKpiCard
        label="Pending amount"
        value={money(summary?.pending_amount, currencySymbol)}
        Icon={Clock3}
        accent="red"
      />
      <PosReportsKpiCard
        label="Manual review"
        value={money(summary?.manual_review_amount, currencySymbol)}
        Icon={AlertTriangle}
        accent="red"
      />
    </div>
  );
}
