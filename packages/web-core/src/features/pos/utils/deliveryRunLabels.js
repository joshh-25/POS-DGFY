const formatDate = (value, includeYear = false) => {
  const dateOnly = String(value || '').slice(0, 10);
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) return null;
  // Construct from date parts to avoid shifting a date-only schedule across time zones.
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' } : {}), timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

export const formatRunScheduleLabel = (run) => {
  if (!run?.scheduled_date) return 'No schedule set';
  const start = String(run.scheduled_date).slice(0, 10);
  const end = run.scheduled_date_end ? String(run.scheduled_date_end).slice(0, 10) : null;
  return end && end !== start ? `${start} → ${end}` : start;
};

export const formatRunPickerOptionLabel = (run) => {
  const label = String(run?.label || '').trim();
  const start = formatDate(run?.scheduled_date);
  if (!start) return `${label} · No date`;
  const end = formatDate(run?.scheduled_date_end);
  if (!end || String(run.scheduled_date_end).slice(0, 10) === String(run.scheduled_date).slice(0, 10)) {
    return `${label} · ${start}`;
  }
  const sameMonth = String(run.scheduled_date).slice(0, 7) === String(run.scheduled_date_end).slice(0, 7);
  return `${label} · ${start}–${sameMonth ? end.replace(/^[A-Za-z]+ /, '') : end}`;
};
