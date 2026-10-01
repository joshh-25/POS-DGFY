import { useMemo } from 'react';
import PosReportsResponsiveTable from './PosReportsResponsiveTable';

const parseDate = (value) => { if (!value) return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed; };
const formatDate = (value) => { const parsed = parseDate(value); return parsed ? parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };
const formatTime = (value) => { const parsed = parseDate(value); return parsed ? parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'; };
const formatDutyType = (value) => { const normalized = String(value || '').trim(); return normalized ? normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()) : '—'; };
const getCashier = (row) => row?.cashier_name || (row?.user_id ? `Cashier #${row.user_id}` : 'Unassigned');
const getDutyType = (row) => formatDutyType(row?.duty_type);
const getBreakMinutes = (row) => Number(row?.break_minutes || 0);
const getWorkedMinutes = (row) => Number(row?.worked_minutes || 0);
const getBreakHours = (row) => getBreakMinutes(row) / 60;
const getWorkedHours = (row) => getWorkedMinutes(row) / 60;
const hasOpenBreak = (row) => Array.isArray(row?.breaks) && row.breaks.some((breakRow) => String(breakRow?.status || '').toLowerCase() === 'open');
const getStatus = (row) => { if (hasOpenBreak(row)) return 'On Break'; const status = String(row?.status || '').trim().toLowerCase(); if (status === 'closed' || row?.ended_at) return 'Completed'; if (status === 'open') return 'Active'; return status ? status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()) : 'Unknown'; };
const formatHours = (value) => Number(value || 0).toFixed(2);
const statusTone = (status) => status === 'Completed' ? 'positive' : status === 'Active' ? 'brand' : status === 'On Break' ? 'secondary' : 'muted';

export default function PosReportsAttendanceTable({ rows = [], searchQuery = '' }) {
  const columns = useMemo(() => [
    { key: 'date', label: 'Date', align: 'left', widthClass: 'w-[135px]', required: true, getValue: (row) => parseDate(row?.started_at)?.getTime() || -Infinity, render: (row) => formatDate(row?.started_at) },
    { key: 'cashier_name', label: 'Cashier', align: 'left', widthClass: 'w-[160px]', required: true, getValue: getCashier, render: getCashier },
    { key: 'duty_type', label: 'Duty/Role', align: 'left', widthClass: 'w-[135px]', defaultVisible: false, getValue: getDutyType, render: getDutyType },
    { key: 'status', label: 'Status', valueTone: (row) => statusTone(getStatus(row)), align: 'center', widthClass: 'w-[130px]', required: true, getValue: getStatus, render: (row) => <span className="font-black">{getStatus(row)}</span> },
    { key: 'started_at', label: 'Time In', align: 'center', widthClass: 'w-[120px]', defaultVisible: true, getValue: (row) => parseDate(row?.started_at)?.getTime() || -Infinity, render: (row) => formatTime(row?.started_at) },
    { key: 'ended_at', label: 'Time Out', align: 'center', widthClass: 'w-[120px]', defaultVisible: true, getValue: (row) => parseDate(row?.ended_at)?.getTime() || -Infinity, render: (row) => formatTime(row?.ended_at) },
    { key: 'break_minutes', label: 'Break (Hours)', align: 'center', widthClass: 'w-[125px]', defaultVisible: false, getValue: getBreakHours, render: (row) => formatHours(getBreakHours(row)) },
    { key: 'worked_minutes', label: 'Worked (Hours)', align: 'center', widthClass: 'w-[135px]', required: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, getValue: getWorkedHours, render: (row) => formatHours(getWorkedHours(row)) }
  ], []);
  return <PosReportsResponsiveTable rows={rows} columns={columns} searchQuery={searchQuery} getSearchValue={(row) => [formatDate(row?.started_at), getCashier(row), getDutyType(row), getStatus(row), formatTime(row?.started_at), getBreakHours(row), getWorkedHours(row)].join(' ')} initialSort={{ key: 'date', direction: 'desc' }} title="Attendance sessions" ariaLabel="Attendance sessions table" caption="Attendance sessions showing date, cashier, duty or role, status, time in, time out, break hours, and worked hours." emptyMessage="No attendance sessions were recorded for these filters." searchEmptyMessage="No attendance rows match your search." idPrefix="pos-reports-attendance" resultLabel="attendance sessions" showActions={false} />;
}
