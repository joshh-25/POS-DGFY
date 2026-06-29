import React from 'react';

export const THEME = {
  bg: '#F9FAFB',
  surface: '#FFFFFF',
  border: '#EAECF0',
  primary: '#1A4E8D',
  text: '#101828',
  muted: '#667085',
  success: '#16A34A',
  successBg: '#ECFDF3',
  warning: '#F59E0B',
  warningBg: '#FFFAEB',
  info: '#1A4586',
  infoBg: '#AEE8F4',
  purple: '#7A5AF8',
  purpleBg: '#F4F3FF',
  orange: '#DC2626',
  orangeBg: '#FEF3F2'
};

export const money = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 'PHP 0.00';
  return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatDate = (value) => {
  if (!value) return 'Recent activity';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recent activity';
  return parsed.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const prettyStatus = (value) => (
  String(value || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase()) || 'Pending'
);

export function StatusBadge({ status }) {
  const normalized = String(status || '').toLowerCase();
  let color = THEME.muted;
  let background = THEME.border;

  if (normalized.includes('active') || normalized.includes('progress') || normalized.includes('preparing') || normalized.includes('confirmed')) {
    color = THEME.info;
    background = THEME.infoBg;
  } else if (normalized.includes('deliver') || normalized.includes('transit') || normalized.includes('complete') || normalized.includes('done')) {
    color = THEME.success;
    background = THEME.successBg;
  } else if (normalized.includes('cancel') || normalized.includes('fail')) {
    color = THEME.orange;
    background = THEME.orangeBg;
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, color, background }}>
      {prettyStatus(status)}
    </span>
  );
}

export function EmptyState({ title, desc }) {
  return (
    <div style={{ padding: '32px 0', textAlign: 'center', color: THEME.muted }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>{desc}</div>
    </div>
  );
}
