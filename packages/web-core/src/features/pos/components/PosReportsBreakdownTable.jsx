import { useMemo } from 'react';
import { Clock3, Package2, Tags } from 'lucide-react';
import PosReportsResponsiveTable from './PosReportsResponsiveTable.jsx';
import PosReportsHourlySalesChart from './PosReportsHourlySalesChart.jsx';
import PosReportsBreakdownChart from './PosReportsBreakdownChart.jsx';
import { getPosReportSignedValueTone } from './posReportValueTones.js';
import { getPosReportRefundsVoidsDisplayValue } from './posReportFormatting.js';
import {
  BackOfficeReportSectionCard as SectionCard
} from '../../../components/backOffice/BackOfficePrimitives.jsx';

const resolveCurrencySymbol = (currencySymbol = '₱') => (
  String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol || '₱'
);

const money = (value, currencySymbol = '₱') => `${resolveCurrencySymbol(currencySymbol)}${Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const number = (value, maximumFractionDigits = 2) => Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits
});

const percent = (value) => `${Number(value || 0).toFixed(2)}%`;

const formatHour = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return value || '—';
  return parsed.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  });
};

const formatRange = (range = {}) => {
  if (!range.date_from && !range.date_to) return 'Selected date range';
  return `${range.date_from || '—'} to ${range.date_to || '—'}`;
};

const reportDefinitions = {
  hourly: {
    title: 'Hourly Sales',
    tableTitle: 'Hourly sales',
    ariaLabel: 'Hourly sales report table',
    resultLabel: 'hourly periods',
    icon: Clock3,
    emptyMessage: 'No hourly sales were recorded for the selected filters.',
    searchEmptyMessage: 'No hourly periods match the loaded report rows.'
  },
  items: {
    title: 'Item Sales',
    tableTitle: 'Item sales',
    ariaLabel: 'Item sales report table',
    resultLabel: 'items',
    icon: Package2,
    emptyMessage: 'No item sales were recorded for the selected filters.',
    searchEmptyMessage: 'No items match the loaded report rows.'
  },
  categories: {
    title: 'Sales by Category',
    tableTitle: 'Sales by category',
    ariaLabel: 'Sales by category report table',
    resultLabel: 'categories',
    icon: Tags,
    emptyMessage: 'No category sales were recorded for the selected filters.',
    searchEmptyMessage: 'No categories match the loaded report rows.'
  }
};

const serverSortFieldsByBreakdown = {
  hourly: {
    bucket_start_local: 'bucket_start_local',
    transaction_count: 'orders',
    item_quantity: 'quantity',
    gross_sales: 'gross_sales',
    discounts: 'discounts',
    net_sales: 'net_sales',
    refunds_voids: 'refunds_voids',
    profit: 'profit',
    profit_margin: 'profit_margin'
  },
  items: {
    item_name: 'item_name',
    sku: 'sku',
    category_name: 'category_name',
    quantity: 'quantity',
    orders: 'orders',
    net_sales: 'net_sales',
    refunds_voids: 'refunds_voids',
    sales_share: 'sales_share',
    average_unit_price: 'average_unit_price',
    profit: 'profit',
    profit_margin: 'profit_margin'
  },
  categories: {
    category_name: 'category_name',
    item_count: 'item_count',
    quantity: 'quantity',
    orders: 'orders',
    net_sales: 'net_sales',
    sales_share: 'sales_share',
    profit: 'profit',
    profit_margin: 'profit_margin'
  }
};

const tableSortKeysByBreakdown = {
  hourly: { orders: 'transaction_count', quantity: 'item_quantity' },
  items: {},
  categories: { quantity: 'quantity' }
};

const signedMoneyColumn = (key, label, symbol, currencySymbol, options = {}) => ({
  key,
  label: `${label} (${symbol})`,
  valueTone: (row) => getPosReportSignedValueTone(row?.[key], key === 'net_sales' ? 'brand' : undefined),
  align: 'left',
  numeric: true,
  widthClass: options.widthClass || 'w-[132px]',
  required: options.required,
  defaultVisible: options.defaultVisible,
  visibility: options.visibility,
  getValue: (row) => Number(row?.[key] || 0),
  render: (row) => money(options.formatValue ? options.formatValue(row?.[key]) : row?.[key], currencySymbol)
});

const quantityColumn = (key, label, options = {}) => ({
  key,
  label,
  valueTone: 'secondary',
  align: options.align || 'center',
  numeric: true,
  widthClass: options.widthClass || 'w-[112px]',
  required: options.required,
  defaultVisible: options.defaultVisible,
  visibility: options.visibility,
  getValue: (row) => Number(row?.[key] || 0),
  render: (row) => number(row?.[key], options.maximumFractionDigits ?? 2)
});

const buildColumns = (breakdown, currencySymbol) => {
  const symbol = resolveCurrencySymbol(currencySymbol);
  if (breakdown === 'hourly') {
    return [
      { key: 'bucket_start_local', label: 'Hour', valueTone: 'primary', widthClass: 'w-[180px]', required: true, getValue: (row) => row?.bucket_start_local || '', getSortValue: (row) => row?.bucket_start_local || '', render: (row) => <span className="whitespace-nowrap">{formatHour(row?.bucket_start_local)}</span> },
      quantityColumn('transaction_count', 'Transactions', { required: true }),
      quantityColumn('item_quantity', 'Items Sold', { required: true }),
      signedMoneyColumn('net_sales', 'Net Sales', symbol, currencySymbol, { required: true }),
      signedMoneyColumn('gross_sales', 'Gross Sales', symbol, currencySymbol, { defaultVisible: true }),
      signedMoneyColumn('refunds_voids', 'Refunds/Voids', symbol, currencySymbol, { defaultVisible: true, formatValue: getPosReportRefundsVoidsDisplayValue }),
      signedMoneyColumn('profit', 'Profit', symbol, currencySymbol, { required: true }),
      { key: 'profit_margin', label: 'Margin (%)', valueTone: (row) => Number(row?.profit || 0) < 0 ? 'danger' : 'secondary', align: 'left', numeric: true, widthClass: 'w-[112px]', defaultVisible: false, getValue: (row) => Number(row?.profit_margin || 0), render: (row) => percent(row?.profit_margin) }
    ];
  }

  if (breakdown === 'items') {
    return [
      { key: 'item_name', label: 'Item', valueTone: 'primary', widthClass: 'w-[220px]', required: true, getValue: (row) => row?.item_name || '', render: (row) => <div className="flex min-w-0 items-center gap-2"><span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600" aria-hidden="true"><Package2 className="h-3.5 w-3.5" /></span><span className="truncate" title={row?.item_name || 'Unnamed item'}>{row?.item_name || 'Unnamed item'}</span></div> },
      { key: 'sku', label: 'SKU', valueTone: 'muted', widthClass: 'w-[130px]', defaultVisible: true, getValue: (row) => row?.sku || '—' },
      { key: 'category_name', label: 'Category', valueTone: 'muted', widthClass: 'w-[150px]', defaultVisible: true, getValue: (row) => row?.category_name || 'Uncategorized' },
      quantityColumn('quantity', 'Quantity', { required: true }),
      quantityColumn('orders', 'Orders', { required: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true } }),
      signedMoneyColumn('net_sales', 'Net Sales', symbol, currencySymbol, { required: true }),
      signedMoneyColumn('refunds_voids', 'Refunds/Voids', symbol, currencySymbol, { required: true, formatValue: getPosReportRefundsVoidsDisplayValue }),
      { key: 'sales_share', label: 'Sales Share (%)', valueTone: 'secondary', align: 'right', numeric: true, widthClass: 'w-[150px]', defaultVisible: true, getValue: (row) => Number(row?.sales_share || 0), render: (row) => percent(row?.sales_share) },
      signedMoneyColumn('average_unit_price', 'Average Price', symbol, currencySymbol, { defaultVisible: false }),
      signedMoneyColumn('profit', 'Profit', symbol, currencySymbol, { defaultVisible: false }),
      { key: 'profit_margin', label: 'Margin (%)', valueTone: (row) => Number(row?.profit || 0) < 0 ? 'danger' : 'secondary', align: 'left', numeric: true, widthClass: 'w-[112px]', defaultVisible: false, getValue: (row) => Number(row?.profit_margin || 0), render: (row) => percent(row?.profit_margin) }
    ];
  }

  return [
    { key: 'category_name', label: 'Category', valueTone: 'primary', widthClass: 'w-[220px]', required: true, getValue: (row) => row?.category_name || 'Uncategorized', render: (row) => <div className="flex min-w-0 items-center gap-2"><span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600" aria-hidden="true"><Tags className="h-3.5 w-3.5" /></span><span className="truncate" title={row?.category_name || 'Uncategorized'}>{row?.category_name || 'Uncategorized'}</span></div> },
    quantityColumn('item_count', 'Items', { required: true }),
    quantityColumn('quantity', 'Quantity', { required: true }),
    quantityColumn('orders', 'Orders', { required: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true } }),
    signedMoneyColumn('net_sales', 'Net Sales', symbol, currencySymbol, { required: true }),
    { key: 'sales_share', label: 'Sales Share (%)', valueTone: 'secondary', align: 'right', numeric: true, widthClass: 'w-[150px]', defaultVisible: true, getValue: (row) => Number(row?.sales_share || 0), render: (row) => percent(row?.sales_share) },
    signedMoneyColumn('profit', 'Profit', symbol, currencySymbol, { defaultVisible: true }),
    { key: 'profit_margin', label: 'Margin (%)', valueTone: (row) => Number(row?.profit || 0) < 0 ? 'danger' : 'secondary', align: 'left', numeric: true, widthClass: 'w-[112px]', defaultVisible: false, getValue: (row) => Number(row?.profit_margin || 0), render: (row) => percent(row?.profit_margin) }
  ];
};

const getSearchValue = (row) => Object.values(row || {}).join(' ').toLowerCase();

export function PosReportsBreakdownSummary({ breakdown, data, currencySymbol = '₱', stale = false }) {
  const definition = reportDefinitions[breakdown] || reportDefinitions.hourly;
  const Icon = definition.icon;
  const isHourly = breakdown === 'hourly';

  return (
    <SectionCard
      title={`${definition.title} trend`}
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500"><Icon className="h-4 w-4" aria-hidden="true" />{data?.timezone || 'Asia/Manila'}</span>
        </div>
      )}
    >
      {stale ? (
        <div role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Offline snapshot from {data?.generated_at ? new Date(data.generated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'the last successful sync'}; values are display-only and may be stale.
        </div>
      ) : null}
      <p className="mb-3 text-xs font-semibold text-slate-500">{formatRange(data?.range)} · Generated {data?.generated_at ? new Date(data.generated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—'}</p>
      {isHourly ? (
        <PosReportsHourlySalesChart rows={data?.rows} currencySymbol={currencySymbol} />
      ) : (
        <PosReportsBreakdownChart breakdown={breakdown} rows={data?.rows} currencySymbol={currencySymbol} />
      )}
    </SectionCard>
  );
}
export default function PosReportsBreakdownTable({
  breakdown,
  data,
  currencySymbol = '₱',
  searchQuery = '',
  sort,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  loading = false,
  disabled = false
}) {
  const definition = reportDefinitions[breakdown] || reportDefinitions.hourly;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const pagination = data?.pagination || {};
  const columns = useMemo(() => buildColumns(breakdown, currencySymbol), [breakdown, currencySymbol]);
  const tableSort = {
    key: tableSortKeysByBreakdown[breakdown]?.[sort?.sort_by] || sort?.sort_by,
    direction: sort?.sort_direction || 'desc'
  };
  const handleSortChange = (nextSort) => {
    const serverSortBy = serverSortFieldsByBreakdown[breakdown]?.[nextSort.key] || nextSort.key;
    onSortChange?.({
      sort_by: serverSortBy,
      sort_direction: nextSort.direction
    });
  };

  return (
    <PosReportsResponsiveTable
      rows={rows}
      columns={columns}
      searchQuery={searchQuery}
      getSearchValue={getSearchValue}
      initialSort={tableSort}
      controlledSort={tableSort}
      onSortChange={handleSortChange}
      serverPagination={{
        currentPage: pagination.page || 1,
        totalPages: pagination.total_pages || 1,
        totalItems: pagination.total_rows ?? pagination.total ?? rows.length,
        pageSize: pagination.limit || 50,
        pageSizeOptions: [20, 50, 100, 200],
        onPageChange,
        onPageSizeChange,
        loading,
        disabled
      }}
      title={definition.tableTitle}
      ariaLabel={definition.ariaLabel}
      caption={`${definition.title} rows for the selected filters.`}
      emptyMessage={definition.emptyMessage}
      searchEmptyMessage={definition.searchEmptyMessage}
      idPrefix={`pos-reports-${breakdown}`}
      resultLabel={definition.resultLabel}
      detailsDialogTitle={`${definition.title} details`}
      loading={loading}
    />
  );
}
