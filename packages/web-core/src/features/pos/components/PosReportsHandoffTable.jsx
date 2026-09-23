import { useMemo } from 'react';
import PosReportsResponsiveTable from './PosReportsResponsiveTable';

const parseDate = (value) => { if (!value) return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed; };
const formatDateTime = (value) => { const parsed = parseDate(value); if (!parsed) return { label: '—', date: '—', time: '' }; const date = parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); const time = parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); return { label: `${date}, ${time}`, date, time }; };
const getSessionId = (row) => row?.operator_session_id == null ? '—' : `SES-${String(row.operator_session_id).padStart(6, '0')}`;
const getOperator = (row) => row?.cashier_name || (row?.user_id ? `Cashier #${row.user_id}` : 'Unassigned');
const getRegister = (row) => row?.terminal_id || '—';
const getStartedAt = (row) => parseDate(row?.started_at);
const getEndedAt = (row) => parseDate(row?.ended_at);
const getDurationMinutes = (row) => { const backendMinutes = Number(row?.minutes); if (Number.isFinite(backendMinutes) && backendMinutes >= 0) return Math.round(backendMinutes); const startedAt = getStartedAt(row); const endedAt = getEndedAt(row) || new Date(); if (!startedAt || endedAt <= startedAt) return 0; return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)); };
const getDurationLabel = (row) => { const totalMinutes = getDurationMinutes(row); const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return hours === 0 ? `${minutes}m` : `${hours}h ${String(minutes).padStart(2, '0')}m`; };
const getStatus = (row) => { const status = String(row?.status || '').trim().toLowerCase(); if (status === 'ended' || getEndedAt(row)) return 'Completed'; if (status === 'active') return 'Active'; return status ? status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()) : 'Unknown'; };
const statusTone = (status) => status === 'Completed' ? 'text-emerald-600' : status === 'Active' ? 'text-amber-600' : 'text-slate-500';

export default function PosReportsHandoffTable({ rows = [], searchQuery = '' }) {
  const columns = useMemo(() => [
    { key: 'operator_session_id', label: 'Session ID', widthClass: 'w-[150px]', required: true, getValue: getSessionId, render: getSessionId },
    { key: 'cashier_name', label: 'Operator', widthClass: 'w-[180px]', required: true, getValue: getOperator, render: getOperator },
    { key: 'terminal_id', label: 'Register', widthClass: 'w-[150px]', visibility: { mobile: false, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: getRegister, render: getRegister },
    { key: 'started_at', label: 'Start Time', widthClass: 'w-[170px]', required: true, getValue: (row) => getStartedAt(row)?.getTime() || -Infinity, render: (row) => formatDateTime(row?.started_at).label },
    { key: 'ended_at', label: 'End Time', widthClass: 'w-[170px]', defaultVisible: false, getValue: (row) => getEndedAt(row)?.getTime() || -Infinity, render: (row) => formatDateTime(row?.ended_at).label },
    { key: 'minutes', label: 'Duration', align: 'right', widthClass: 'w-[120px]', required: true, getValue: getDurationMinutes, render: getDurationLabel },
    { key: 'status', label: 'Status', widthClass: 'w-[130px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: getStatus, render: (row) => <span className={`font-black ${statusTone(getStatus(row))}`}>{getStatus(row)}</span> }
  ], []);
  return <PosReportsResponsiveTable rows={rows} columns={columns} searchQuery={searchQuery} getSearchValue={(row) => [getSessionId(row), getOperator(row), getRegister(row), formatDateTime(row?.started_at).label, formatDateTime(row?.ended_at).label, getDurationLabel(row), getStatus(row)].join(' ')} initialSort={{ key: 'started_at', direction: 'desc' }} title="Operator handoff sessions" ariaLabel="Operator handoff sessions table" caption="Operator handoff sessions with session ID, operator, register, start and end time, duration, and status." emptyMessage="No operator sessions were recorded for these filters." searchEmptyMessage="No handoff sessions match your search." idPrefix="pos-reports-handoff" resultLabel="handoff sessions" />;
}
