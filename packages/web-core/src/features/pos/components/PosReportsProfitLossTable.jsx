import { useMemo } from 'react';
import PosReportsResponsiveTable from './PosReportsResponsiveTable';

const resolveCurrencySymbol = (currencySymbol = '₱') => String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol || '₱';
const money = (value, currencySymbol = '₱') => `${resolveCurrencySymbol(currencySymbol)}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const getProfitLoss = (row) => Number(row?.pos_profit_loss ?? Number(row?.net_profit || 0) - Number(row?.loss || 0));
const getNetProfit = (row) => Number(row?.net_profit ?? Math.max(0, getProfitLoss(row)));
const getLoss = (row) => Number(row?.loss ?? Math.max(0, -getProfitLoss(row)));
const getProfitMargin = (row) => Number(row?.profit_margin ?? (Number(row?.net_sales || 0) > 0 ? (getProfitLoss(row) / Number(row.net_sales)) * 100 : 0));
const tone = (value) => value > 0 ? 'text-emerald-600' : value < 0 ? 'text-rose-600' : 'text-amber-600';

export default function PosReportsProfitLossTable({ rows = [], currencySymbol = '₱', searchQuery = '' }) {
  const symbol = resolveCurrencySymbol(currencySymbol);
  const columns = useMemo(() => [
    { key: 'rank', label: 'Rank', widthClass: 'w-[58px]', required: true, getValue: (row) => Number(row?.rank || 0), render: (row, index) => row?.rank || index + 1 },
    { key: 'item_name', label: 'Item', widthClass: 'w-[190px]', required: true, getValue: (row) => row?.item_name || '', render: (row) => row?.item_name || 'Unnamed item' },
    { key: 'category', label: 'Category', widthClass: 'w-[130px]', defaultVisible: false, getValue: (row) => row?.category || 'Uncategorized', render: (row) => row?.category || 'Uncategorized' },
    { key: 'item_sold', label: 'Item Sold', align: 'center', widthClass: 'w-[100px]', defaultVisible: false, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, getValue: (row) => Number(row?.item_sold || 0), render: (row) => number(row?.item_sold) },
    { key: 'gross_sales', label: `Gross Sales (${symbol})`, align: 'left', numeric: true, widthClass: 'w-[120px]', defaultVisible: false, getValue: (row) => Number(row?.gross_sales || 0), render: (row) => money(row?.gross_sales, currencySymbol) },
    { key: 'cogs', label: `COGS (${symbol})`, align: 'left', numeric: true, widthClass: 'w-[110px]', defaultVisible: false, getValue: (row) => Number(row?.cogs || 0), render: (row) => money(row?.cogs, currencySymbol) },
    { key: 'net_sales', label: `Net Sales (${symbol})`, align: 'left', numeric: true, widthClass: 'w-[120px]', required: true, getValue: (row) => Number(row?.net_sales || 0), render: (row) => money(row?.net_sales, currencySymbol) },
    { key: 'net_profit', label: `Net Profit (${symbol})`, align: 'left', numeric: true, widthClass: 'w-[120px]', required: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, getValue: getNetProfit, render: (row) => <span aria-label={`${getProfitLoss(row) > 0 ? 'Profit' : 'No profit'} ${money(getNetProfit(row), currencySymbol)}`} className={`font-black ${getNetProfit(row) > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{money(getNetProfit(row), currencySymbol)}</span> },
    { key: 'loss', label: `Loss (${symbol})`, align: 'left', numeric: true, widthClass: 'w-[100px]', required: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, getValue: getLoss, render: (row) => <span aria-label={`${getLoss(row) > 0 ? 'Loss' : 'No loss'} ${money(getLoss(row), currencySymbol)}`} className={`font-black ${getLoss(row) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(getLoss(row), currencySymbol)}</span> },
    { key: 'profit_margin', label: 'Profit Margin (%)', align: 'left', numeric: true, widthClass: 'w-[120px]', defaultVisible: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: false, desktop: true }, getValue: getProfitMargin, render: (row) => <span className={`font-black ${tone(getProfitLoss(row))}`}>{getProfitMargin(row).toFixed(2)}%</span> }
  ], [currencySymbol, symbol]);

  return <PosReportsResponsiveTable rows={rows} columns={columns} searchQuery={searchQuery} getSearchValue={(row) => [row?.rank, row?.item_name, row?.category, row?.item_sold, row?.gross_sales, row?.cogs, row?.net_sales, getNetProfit(row), getLoss(row), getProfitMargin(row)].join(' ')} initialSort={{ key: 'rank', direction: 'asc' }} title="Profit and loss by item" ariaLabel="Profit and loss table" caption="Item-level profit and loss with rank, sales, cost, net profit, loss, and margin." emptyMessage="No profit and loss data was recorded for the selected filters." searchEmptyMessage="No profit and loss rows match your search." idPrefix="pos-reports-profit-loss" resultLabel="profit and loss items" />;
}
