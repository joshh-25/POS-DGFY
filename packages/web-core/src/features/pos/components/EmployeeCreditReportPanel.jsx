import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CreditCard, RotateCcw, TrendingUp } from 'lucide-react';
import { fetchEmployeeCreditReport } from '../services/employeeCreditService.js';
import { PosReportsKpiCard } from './PosReportsKpiCards.jsx';
import PosReportsResponsiveTable from './PosReportsResponsiveTable.jsx';

const money = (value, symbol = '₱') => `${String(symbol).toUpperCase() === 'PHP' ? '₱' : symbol}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDateTime = (value) => value ? new Date(value).toLocaleString() : '-';
const employeeName = (entry) => entry?.account?.employeeProfile?.full_name
  || entry?.account?.employee?.username
  || entry?.account?.employee?.email
  || '-';
const entryTypeLabel = (entry) => String(entry?.entry_type || '').replace(/_/g, ' ') || '-';

const buildColumns = (currencySymbol) => [
  {
    key: 'created_at',
    label: 'Time',
    widthClass: 'min-w-[11rem]',
    render: (entry) => formatDateTime(entry.created_at),
    getSortValue: (entry) => entry.created_at || ''
  },
  {
    key: 'employee',
    label: 'Employee',
    widthClass: 'min-w-[12rem]',
    render: (entry) => employeeName(entry),
    getSortValue: (entry) => employeeName(entry)
  },
  {
    key: 'entry_type',
    label: 'Type',
    widthClass: 'min-w-[10rem]',
    render: (entry) => entryTypeLabel(entry),
    getSortValue: (entry) => entryTypeLabel(entry)
  },
  {
    key: 'amount',
    label: 'Amount',
    align: 'right',
    widthClass: 'min-w-[8rem]',
    render: (entry) => money(entry.amount, currencySymbol),
    getSortValue: (entry) => Number(entry.amount || 0)
  },
  {
    key: 'balance_after',
    label: 'Outstanding After',
    align: 'right',
    widthClass: 'min-w-[10rem]',
    render: (entry) => money(entry.balance_after, currencySymbol),
    getSortValue: (entry) => Number(entry.balance_after || 0)
  },
  {
    key: 'actor',
    label: 'Cashier',
    widthClass: 'min-w-[10rem]',
    render: (entry) => entry.actor?.username || '-',
    getSortValue: (entry) => entry.actor?.username || ''
  },
  {
    key: 'authorization_reference',
    label: 'Reference',
    widthClass: 'min-w-[12rem]',
    render: (entry) => entry.authorization_reference || '-',
    getSortValue: (entry) => entry.authorization_reference || ''
  }
];

export default function EmployeeCreditReportPanel({
  dateFrom,
  dateTo,
  currencySymbol = '₱',
  refreshKey = 0,
  isOnline = true,
  searchQuery = '',
  onReportDataChange = null
}) {
  const [data, setData] = useState({ entries: [], totals: {}, excluded_from_cashflow: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  useEffect(() => {
    const currentRequest = requestSequence.current + 1;
    requestSequence.current = currentRequest;

    if (!isOnline) {
      onReportDataChange?.(null);
      return undefined;
    }

    const controller = new AbortController();
    const requestTimer = window.setTimeout(() => {
      setLoading(true);
      setError('');

      fetchEmployeeCreditReport({
        date_from: dateFrom,
        date_to: dateTo,
        signal: controller.signal
      })
        .then((report) => {
          if (requestSequence.current === currentRequest) {
            setData(report);
            onReportDataChange?.(report);
          }
        })
        .catch((requestError) => {
          if (controller.signal.aborted || requestSequence.current !== currentRequest) return;
          setError(requestError?.response?.data?.message || requestError?.message || 'Failed to load Employee Credit report.');
          onReportDataChange?.(null);
        })
        .finally(() => {
          if (!controller.signal.aborted && requestSequence.current === currentRequest) {
            setLoading(false);
          }
        });
    }, 0);

    return () => {
      window.clearTimeout(requestTimer);
      controller.abort();
    };
  }, [dateFrom, dateTo, refreshKey, isOnline, onReportDataChange]);

  const columns = useMemo(() => buildColumns(currencySymbol), [currencySymbol]);
  const entries = Array.isArray(data.entries) ? data.entries : [];

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <PosReportsKpiCard label="Credit sales" value={money(data.totals?.credit_sales, currencySymbol)} Icon={CreditCard} accent="blue" />
        <PosReportsKpiCard label="Repayments" value={money(data.totals?.repayments, currencySymbol)} Icon={TrendingUp} accent="green" />
        <PosReportsKpiCard label="Admin adjustments" value={money(data.totals?.grants, currencySymbol)} Icon={Banknote} accent="purple" />
        <PosReportsKpiCard label="Reversals" value={money(data.totals?.reversals, currencySymbol)} Icon={RotateCcw} accent="red" />
      </div>
      {!isOnline || error ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{!isOnline ? 'Employee Credit reports require an online connection.' : error}</p> : null}
      {loading ? <p role="status" className="text-xs font-semibold text-blue-800">Refreshing Employee Credit activity...</p> : null}
      <PosReportsResponsiveTable
        rows={entries}
        columns={columns}
        searchQuery={searchQuery}
        getSearchValue={(entry) => [entry.created_at, employeeName(entry), entryTypeLabel(entry), entry.amount, entry.balance_after, entry.actor?.username, entry.authorization_reference].join(' ')}
        title="Employee Credit activity"
        ariaLabel="Employee Credit activity table"
        idPrefix="pos-reports-employee-credit-activity"
        emptyMessage={loading ? 'Loading Employee Credit activity...' : 'No Employee Credit activity for this period.'}
        searchEmptyMessage="No Employee Credit activity matches your search."
        resultLabel="activity entries"
      />
    </div>
  );
}
