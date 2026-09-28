export const DINE_IN_SCHEDULE_STATES = Object.freeze({
  UPCOMING: 'upcoming',
  LATE: 'late',
  READY: 'ready'
});

export const DINE_IN_SCHEDULE_ALERT_MINUTES = Object.freeze([15, 5, 3, 1]);

const parseScheduledTimestamp = (value) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const isDineInOrder = (order = {}) => (
  String(order?.order_method || '').trim().toLowerCase() === 'dine_in'
);

export const isScheduledDineInOrder = (order = {}) => (
  isDineInOrder(order)
  && parseScheduledTimestamp(order?.scheduled_for) !== null
);

export const getDineInScheduleState = (order = {}, now = Date.now()) => {
  if (!isScheduledDineInOrder(order)) return null;
  if (String(order?.fulfillment_status || '').trim().toLowerCase() === 'ready_for_pickup') {
    return DINE_IN_SCHEDULE_STATES.READY;
  }
  return parseScheduledTimestamp(order.scheduled_for) <= now
    ? DINE_IN_SCHEDULE_STATES.LATE
    : DINE_IN_SCHEDULE_STATES.UPCOMING;
};

export const getDineInScheduleStateLabel = (state) => {
  switch (state) {
  case DINE_IN_SCHEDULE_STATES.READY:
    return 'Ready to Serve';
  case DINE_IN_SCHEDULE_STATES.LATE:
    return 'Late';
  case DINE_IN_SCHEDULE_STATES.UPCOMING:
    return 'Upcoming';
  default:
    return 'Not scheduled';
  }
};

export const getDineInScheduleTimingLabel = (order = {}, now = Date.now()) => {
  if (!isScheduledDineInOrder(order)) return null;
  const state = getDineInScheduleState(order, now);
  if (state === DINE_IN_SCHEDULE_STATES.READY) return 'Ready to serve';

  const differenceMinutes = Math.ceil((parseScheduledTimestamp(order.scheduled_for) - now) / 60000);
  if (differenceMinutes <= 0) {
    return differenceMinutes === 0
      ? 'Due now'
      : `Late by ${Math.abs(differenceMinutes)} min`;
  }
  if (differenceMinutes < 60) return `In ${differenceMinutes} min`;

  const hours = Math.floor(differenceMinutes / 60);
  const minutes = differenceMinutes % 60;
  return minutes > 0 ? `In ${hours}h ${minutes}m` : `In ${hours}h`;
};

export const getDineInScheduleRemainingSeconds = (order = {}, now = Date.now()) => {
  if (!isScheduledDineInOrder(order)) return null;
  const scheduledTimestamp = parseScheduledTimestamp(order.scheduled_for);
  const differenceSeconds = Math.ceil((scheduledTimestamp - now) / 1000);
  return Object.is(differenceSeconds, -0) ? 0 : differenceSeconds;
};

export const formatDineInScheduleCountdown = (seconds) => {
  const normalizedSeconds = Math.floor(Math.max(0, Math.abs(Number(seconds) || 0)));
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const remainingSeconds = normalizedSeconds % 60;
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(remainingSeconds).padStart(2, '0')}s`;
};

export const getDineInScheduleCountdownLabel = (order = {}, now = Date.now()) => {
  if (!isScheduledDineInOrder(order)) return null;
  const state = getDineInScheduleState(order, now);
  if (state === DINE_IN_SCHEDULE_STATES.READY) return 'Ready to serve';

  const remainingSeconds = getDineInScheduleRemainingSeconds(order, now);
  if (remainingSeconds > 0) return `In ${formatDineInScheduleCountdown(remainingSeconds)}`;
  if (remainingSeconds === 0) return 'Due now';
  return `Late by ${formatDineInScheduleCountdown(remainingSeconds)}`;
};

export const getDineInScheduleAlertMilestone = (order = {}, now = Date.now()) => {
  if (!isScheduledDineInOrder(order)) return null;
  if (getDineInScheduleState(order, now) === DINE_IN_SCHEDULE_STATES.READY) return null;

  const remainingSeconds = getDineInScheduleRemainingSeconds(order, now);
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return null;

  for (let index = 0; index < DINE_IN_SCHEDULE_ALERT_MINUTES.length; index += 1) {
    const milestoneMinutes = DINE_IN_SCHEDULE_ALERT_MINUTES[index];
    const upperBoundSeconds = milestoneMinutes * 60;
    const lowerBoundSeconds = (DINE_IN_SCHEDULE_ALERT_MINUTES[index + 1] || 0) * 60;
    if (remainingSeconds <= upperBoundSeconds && remainingSeconds > lowerBoundSeconds) {
      return milestoneMinutes;
    }
  }

  return null;
};

export const sortDineInScheduleOrders = (orders = []) => (
  (Array.isArray(orders) ? orders : [])
    .filter(isDineInOrder)
    .slice()
    .sort((left, right) => {
      const leftScheduledTimestamp = parseScheduledTimestamp(left?.scheduled_for);
      const rightScheduledTimestamp = parseScheduledTimestamp(right?.scheduled_for);
      if (leftScheduledTimestamp !== null && rightScheduledTimestamp === null) return -1;
      if (leftScheduledTimestamp === null && rightScheduledTimestamp !== null) return 1;
      if (leftScheduledTimestamp !== null && rightScheduledTimestamp !== null) {
        const scheduledDifference = leftScheduledTimestamp - rightScheduledTimestamp;
        if (scheduledDifference !== 0) return scheduledDifference;
      }

      const createdDifference = (
        new Date(left?.created_at || 0).getTime() || 0
      ) - (
        new Date(right?.created_at || 0).getTime() || 0
      );
      if (createdDifference !== 0) return createdDifference;
      return Number(left?.pos_transaction_id || 0) - Number(right?.pos_transaction_id || 0);
    })
);
