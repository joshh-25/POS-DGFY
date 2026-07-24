const SERVICE_FALLBACK_TIME_SLOTS = ['09:00', '11:00', '13:00', '15:00', '17:00'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_KEY_ALIASES = {
  0: ['0', 'sun', 'sunday'],
  1: ['1', 'mon', 'monday'],
  2: ['2', 'tue', 'tues', 'tuesday'],
  3: ['3', 'wed', 'wednesday'],
  4: ['4', 'thu', 'thur', 'thurs', 'thursday'],
  5: ['5', 'fri', 'friday'],
  6: ['6', 'sat', 'saturday']
};

const pad2 = (value) => String(value).padStart(2, '0');

const formatLocalDateInputValue = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const formatServiceAppointmentSummary = (appointmentAt) => {
  const raw = String(appointmentAt || '').trim();
  if (!raw) return 'Schedule needed';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return 'Schedule needed';
  return parsed.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

export const formatLongDateLabel = (dateString) => {
  if (!dateString) return 'Pick a date';
  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Pick a date';
  return parsed.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
};

export const formatShortDateLabel = (dateString) => {
  if (!dateString) return 'Pick a date';
  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Pick a date';
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

export const formatTimeSlotLabel = (timeString) => {
  if (!timeString) return 'Pick a time';
  const [hourRaw, minuteRaw = '00'] = String(timeString).split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 'Pick a time';
  const normalized = new Date(2000, 0, 1, hour, minute, 0, 0);
  return normalized.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};

export const getDatePartFromAppointment = (appointmentAt) => {
  const raw = String(appointmentAt || '').trim();
  return raw.includes('T') ? raw.split('T')[0] : '';
};

export const getTimePartFromAppointment = (appointmentAt) => {
  const raw = String(appointmentAt || '').trim();
  if (!raw.includes('T')) return '';
  const timePart = raw.split('T')[1] || '';
  return timePart.slice(0, 5);
};

export const combineDateAndTimeParts = (datePart, timePart) => {
  if (!datePart || !timePart) return '';
  return `${datePart}T${timePart}`;
};

const normalizeSlotClockValue = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${pad2(hour)}:${pad2(minute)}`;
};

const toMinutesFromClock = (clockValue) => {
  const normalized = normalizeSlotClockValue(clockValue);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  return (hour * 60) + minute;
};

const parseWeeklyAvailabilitySlot = (entry) => {
  if (typeof entry === 'string') {
    const [startRaw, endRaw] = entry.split('-');
    const start = normalizeSlotClockValue(startRaw);
    const end = normalizeSlotClockValue(endRaw);
    return start && end ? { start, end } : null;
  }
  if (entry && typeof entry === 'object') {
    const start = normalizeSlotClockValue(entry.start || entry.from || entry.open);
    const end = normalizeSlotClockValue(entry.end || entry.to || entry.close);
    return start && end ? { start, end } : null;
  }
  return null;
};

const getServiceWeeklyAvailability = (serviceItem) => (
  serviceItem?.service_resources?.weekly_availability
  || serviceItem?.service_detail?.service_resources?.weekly_availability
  || serviceItem?.service_detail?.weekly_availability
  || null
);

const getServiceDurationMinutes = (serviceItem) => {
  const duration = Number(serviceItem?.service_detail?.duration_minutes || serviceItem?.duration_minutes || 0);
  return Number.isFinite(duration) && duration > 0 ? duration : 120;
};

const getNormalizedWeeklyAvailabilityByDay = (serviceItem) => {
  const raw = getServiceWeeklyAvailability(serviceItem);
  const resolved = {};
  for (let dayIndex = 0; dayIndex <= 6; dayIndex += 1) {
    let dayValue = null;
    const aliases = DAY_KEY_ALIASES[dayIndex] || [];
    for (const alias of aliases) {
      if (raw && Object.prototype.hasOwnProperty.call(raw, alias)) {
        dayValue = raw[alias];
        break;
      }
    }
    const normalizedEntries = (Array.isArray(dayValue) ? dayValue : dayValue != null ? [dayValue] : [])
      .map(parseWeeklyAvailabilitySlot)
      .filter(Boolean);
    resolved[dayIndex] = normalizedEntries;
  }
  return resolved;
};

export const buildServiceDateOptions = (serviceItem, maxOptions = 7) => {
  const dayMap = getNormalizedWeeklyAvailabilityByDay(serviceItem);
  const hasAvailabilityRules = Object.values(dayMap).some((entries) => entries.length > 0);
  const leadTimeMinutes = Math.max(0, Number(serviceItem?.service_detail?.lead_time_minutes || 0));
  const firstAllowed = new Date(Date.now() + (leadTimeMinutes * 60 * 1000));
  const options = [];
  for (let offset = 0; offset < 30 && options.length < maxOptions; offset += 1) {
    const candidate = new Date(firstAllowed);
    candidate.setHours(0, 0, 0, 0);
    candidate.setDate(candidate.getDate() + offset);
    const daySlots = dayMap[candidate.getDay()] || [];
    if (hasAvailabilityRules && daySlots.length === 0) continue;
    options.push({
      value: formatLocalDateInputValue(candidate),
      label: formatShortDateLabel(formatLocalDateInputValue(candidate)),
      weekday: DAY_LABELS[candidate.getDay()],
      hasAvailability: daySlots.length > 0
    });
  }
  return options;
};

export const buildServiceTimeSlotOptions = (serviceItem, dateString) => {
  if (!dateString) return [];
  const selectedDate = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(selectedDate.getTime())) return [];
  const dayMap = getNormalizedWeeklyAvailabilityByDay(serviceItem);
  const daySlots = dayMap[selectedDate.getDay()] || [];
  if (daySlots.length === 0) {
    return SERVICE_FALLBACK_TIME_SLOTS.map((value) => ({ value, label: formatTimeSlotLabel(value), source: 'fallback' }));
  }
  const intervalMinutes = Math.max(60, Math.min(120, getServiceDurationMinutes(serviceItem)));
  const values = [];
  daySlots.forEach((slot) => {
    const startMinutes = toMinutesFromClock(slot.start);
    const endMinutes = toMinutesFromClock(slot.end);
    if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return;
    for (let minute = startMinutes; minute < endMinutes; minute += intervalMinutes) {
      const clockValue = `${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`;
      values.push(clockValue);
    }
  });
  return [...new Set(values)].map((value) => ({ value, label: formatTimeSlotLabel(value), source: 'availability' }));
};

export const getPreferredBookingTimeForDate = (serviceItem, dateString, currentTime = '') => {
  const availableSlots = buildServiceTimeSlotOptions(serviceItem, dateString);
  if (currentTime && availableSlots.some((slot) => slot.value === currentTime)) return currentTime;
  return availableSlots[0]?.value || '09:00';
};
