import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { STOREFRONT_BUSINESS_DAY_OPTIONS } from '../../../../../../packages/web-core/src/features/settings/storefrontBusinessHours.js';

const formatMinutes = (time) => {
  const [hourRaw, minuteRaw] = String(time || '00:00').split(':');
  const hour24 = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return '';
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
};

export function StorefrontExpandableBusinessHours({ schedule, theme }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { weekly = {}, timezone = 'Asia/Manila' } = schedule || {};

  const groupedSchedule = useMemo(() => {
    const groups = [];
    STOREFRONT_BUSINESS_DAY_OPTIONS.forEach((day) => {
      const entry = weekly[day.key];
      if (!entry?.enabled) return;
      const signature = (entry.intervals || [])
        .map((interval) => `${interval.open}-${interval.close}`)
        .join('|');
      const existing = groups.find((group) => group.signature === signature);
      if (existing) {
        existing.days.push(day.label);
        existing.dayKeys.push(day.key);
        return;
      }

      const intervals = (entry.intervals || []).map((interval) => (
        interval.open === interval.close
          ? '24 hours'
          : `${formatMinutes(interval.open)} - ${formatMinutes(interval.close)}`
      )).join(', ');

      groups.push({
        signature,
        days: [day.label],
        dayKeys: [day.key],
        intervals
      });
    });
    return groups;
  }, [weekly]);

  const currentStatus = useMemo(() => {
    let now;
    try {
      now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
    } catch {
      now = new Date();
    }

    const currentDayOption = STOREFRONT_BUSINESS_DAY_OPTIONS[now.getDay()];
    const currentDayKey = currentDayOption.key;
    const entry = weekly[currentDayKey];
    if (!entry?.enabled) {
      return { prefix: 'Closed today', prefixColor: '#ef4444', suffix: '', dayKey: currentDayKey };
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const intervals = entry.intervals || [];
    const isCurrentlyOpen = intervals.some((interval) => {
      if (interval.open === interval.close) return true;
      const openMins = Number(interval.open.split(':')[0]) * 60 + Number(interval.open.split(':')[1]);
      const closeMins = Number(interval.close.split(':')[0]) * 60 + Number(interval.close.split(':')[1]);
      const adjustedCloseMins = closeMins < openMins ? closeMins + 1440 : closeMins;
      return currentMinutes >= openMins && currentMinutes < adjustedCloseMins;
    });
    const currentInterval = intervals.find((interval) => {
      if (interval.open === interval.close) return true;
      const openMins = Number(interval.open.split(':')[0]) * 60 + Number(interval.open.split(':')[1]);
      const closeMins = Number(interval.close.split(':')[0]) * 60 + Number(interval.close.split(':')[1]);
      const adjustedCloseMins = closeMins < openMins ? closeMins + 1440 : closeMins;
      return currentMinutes >= openMins && currentMinutes < adjustedCloseMins;
    });
    const nextClose = currentInterval?.close || null;
    const nextOpen = intervals.find((interval) => {
      const openMins = Number(interval.open.split(':')[0]) * 60 + Number(interval.open.split(':')[1]);
      return currentMinutes < openMins;
    })?.open || null;

    const intervalsStr = intervals.map((interval) => {
      if (interval.open === interval.close) return '24 hours';
      return `${formatMinutes(interval.open)} - ${formatMinutes(interval.close)}`;
    }).join(', ');

    if (intervalsStr === '24 hours') {
      return { prefix: 'Open 24 hours today', prefixColor: '#16a34a', suffix: '', dayKey: currentDayKey };
    }
    if (isCurrentlyOpen) {
      return { prefix: 'Open now', prefixColor: '#16a34a', suffix: ` - Closes at ${formatMinutes(nextClose)}`, dayKey: currentDayKey };
    }
    if (nextOpen) {
      return { prefix: 'Closed now', prefixColor: '#ef4444', suffix: ` - Opens at ${formatMinutes(nextOpen)} today`, dayKey: currentDayKey };
    }
    return { prefix: 'Open today', prefixColor: '#334155', suffix: `: ${intervalsStr}`, dayKey: currentDayKey };
  }, [weekly, timezone]);

  if (groupedSchedule.length === 0) {
    return <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Closed</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          color: '#334155',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <span>
          <span style={{ color: currentStatus.prefixColor || '#334155' }}>{currentStatus.prefix}</span>
          <span style={{ color: '#334155', whiteSpace: 'pre-wrap' }}>{currentStatus.suffix}</span>
        </span>
        {isExpanded ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
      </button>

      {isExpanded && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          marginTop: 4,
          padding: '8px 12px',
          background: 'rgba(0,0,0,0.03)',
          borderRadius: 8
        }}>
          {groupedSchedule.map((group) => {
            const isToday = group.dayKeys.includes(currentStatus.dayKey);
            return (
              <div
                key={`${group.signature}-${group.days.join('-')}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: 8,
                  fontSize: 12,
                  color: isToday ? (theme?.accentDark || '#0f172a') : '#475569',
                  fontWeight: isToday ? 700 : 500
                }}
              >
                <div>{group.days.join(', ')}</div>
                <div style={{ textAlign: 'right' }}>{group.intervals}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
