import { useMemo } from 'react';
import { Package2 } from 'lucide-react';
import PosReportsResponsiveTable from './PosReportsResponsiveTable';

const resolveCurrencySymbol = (currencySymbol = '₱') => (
  String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol || '₱'
);
const money = (value, currencySymbol = '₱') => `${resolveCurrencySymbol(currencySymbol)}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value, maximumFractionDigits = 2) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits });
const getQuantity = (row) => Number(row?.quantity_sold ?? row?.quantity ?? 0);
const getNetSales = (row) => Number(row?.net_sales || 0);
const getSalesShare = (row, totalSales) => row?.sales_share_percentage != null
  ? Number(row.sales_share_percentage || 0)
  : Number(totalSales || 0) > 0 ? (getNetSales(row) / Number(totalSales)) * 100 : 0;

export default function PosReportsTopItemsTable({ rows = [], currencySymbol = '₱', totalSales = 0, searchQuery = '' }) {
  const symbol = resolveCurrencySymbol(currencySymbol);
  const columns = useMemo(() => [
    { key: 'rank', label: 'Rank', align: 'center', widthClass: 'w-[58px]', required: true, getValue: (row) => Number(row?.rank || 0), render: (row, index) => row?.rank || index + 1 },
    { key: 'item_name', label: 'Items', widthClass: 'w-[240px]', required: true, getValue: (row) => row?.item_name || '', render: (row) => <div className="flex min-w-0 items-center gap-2"><span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600" aria-hidden="true"><Package2 className="h-3.5 w-3.5" /></span><span className="truncate" title={row?.item_name || 'Unnamed item'}>{row?.item_name || 'Unnamed item'}</span></div> },
    { key: 'category', label: 'Category', widthClass: 'w-[150px]', getValue: (row) => row?.category || '—', visibility: { mobile: false, tabletPortrait: true, tabletLandscape: true, desktop: true } },
    { key: 'quantity_sold', label: 'Quantity Sold', align: 'center', widthClass: 'w-[130px]', required: true, getValue: getQuantity, render: (row) => number(getQuantity(row)), visibility: { mobile: false, tabletPortrait: true, tabletLandscape: true, desktop: true } },
    { key: 'net_sales', label: `Net Sales (${symbol})`, align: 'left', numeric: true, widthClass: 'w-[140px]', required: true, getValue: getNetSales, render: (row) => money(getNetSales(row), currencySymbol) },
    { key: 'sales_share_percentage', label: '% of Total Sales', align: 'right', widthClass: 'w-[190px]', defaultVisible: true, getValue: (row) => getSalesShare(row, totalSales), render: (row) => { const share = Math.max(0, getSalesShare(row, totalSales)); return <div className="flex items-center justify-end gap-2"><span className="w-12 text-right tabular-nums">{share.toFixed(1)}%</span><span className="h-2 w-16 overflow-hidden rounded-full bg-cyan-100" role="progressbar" aria-label={`${row?.item_name || 'Item'} share of total sales`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(share.toFixed(1))}><span className="block h-full rounded-full bg-[#1A4E8D]" style={{ width: `${Math.min(100, share)}%` }} /></span></div>; } },
    { key: 'average_price', label: `Average Price (${symbol})`, align: 'left', numeric: true, widthClass: 'w-[140px]', defaultVisible: true, getValue: (row) => Number(row?.average_price ?? (getQuantity(row) > 0 ? getNetSales(row) / getQuantity(row) : 0)), render: (row) => money(row?.average_price ?? (getQuantity(row) > 0 ? getNetSales(row) / getQuantity(row) : 0), currencySymbol) },
    { key: 'orders', label: 'Orders', align: 'center', widthClass: 'w-[86px]', required: true, defaultVisible: true, getValue: (row) => Number(row?.orders || 0), render: (row) => number(row?.orders, 0), visibility: { mobile: false, tabletPortrait: false, tabletLandscape: false, desktop: true } }
  ], [currencySymbol, symbol, totalSales]);

  return <PosReportsResponsiveTable rows={rows} columns={columns} searchQuery={searchQuery} getSearchValue={(row) => [row?.rank, row?.item_name, row?.category, getQuantity(row), getNetSales(row), getSalesShare(row, totalSales), row?.average_price, row?.orders].join(' ')} initialSort={{ key: 'net_sales', direction: 'desc' }} title="Top-selling items" ariaLabel="Top-selling items table" caption="Top-selling items ranked by net sales, including quantity sold, sales share, average price, and orders." emptyMessage="No top-item activity found for the selected filters." searchEmptyMessage="No top-selling items match your search." idPrefix="pos-reports-top-items" resultLabel="top-selling items" />;
}
