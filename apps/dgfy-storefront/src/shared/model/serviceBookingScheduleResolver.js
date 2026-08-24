export const resolveServiceBookingScheduleAt = (line, fallbackScheduleAt = '') => {
  const lineScheduleAt = String(line?.service_schedule_at || '').trim();
  return lineScheduleAt || String(fallbackScheduleAt || '').trim();
};
