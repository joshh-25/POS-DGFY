import {
  getDineInScheduleAlertMilestone,
  isScheduledDineInOrder
} from './dineInSchedule.js';

const getDineInScheduleAlertOrderKey = (order = {}) => (
  order.pos_transaction_id || order.invoice_number || order.tracking_pin || 'unknown'
);

const getScheduledTimestamp = (order = {}) => (
  new Date(order?.scheduled_for || 0).getTime() || 0
);

export const isDineInScheduleAlertsEnabled = ({
  workflowMode,
  onlineOrderQueueEnabled,
  incomingOrdersAccessState,
  hasActiveShift,
  canTransactPos,
  locked
} = {}) => (
  workflowMode === 'fnb'
  && Boolean(onlineOrderQueueEnabled)
  && incomingOrdersAccessState === 'allowed'
  && Boolean(hasActiveShift)
  && Boolean(canTransactPos)
  && !locked
);

export const getDineInScheduleAlertKey = (scopeKey, order, milestone) => (
  `${scopeKey}:${getDineInScheduleAlertOrderKey(order)}:${order?.scheduled_for}:${milestone}`
);

export const getDineInScheduleAlertCandidates = (
  orders = [],
  { now = Date.now(), scopeKey = '', alertedKeys = new Set() } = {}
) => {
  const knownAlertKeys = alertedKeys instanceof Set ? alertedKeys : new Set(alertedKeys);

  return (Array.isArray(orders) ? orders : [])
    .filter(isScheduledDineInOrder)
    .map((order) => {
      const milestone = getDineInScheduleAlertMilestone(order, now);
      if (!milestone) return null;

      const alertKey = getDineInScheduleAlertKey(scopeKey, order, milestone);
      if (knownAlertKeys.has(alertKey)) return null;

      return { alertKey, milestone, order };
    })
    .filter(Boolean);
};

export const appendDineInScheduleAlertQueue = (currentQueue = [], additions = []) => {
  const queue = Array.isArray(currentQueue) ? currentQueue : [];
  const queuedKeys = new Set(queue.map((alert) => alert?.alertKey));
  const uniqueAdditions = (Array.isArray(additions) ? additions : [])
    .filter(({ alertKey }) => !queuedKeys.has(alertKey));

  if (uniqueAdditions.length === 0) return queue;

  return [...queue, ...uniqueAdditions].sort((left, right) => (
    getScheduledTimestamp(left?.order) - getScheduledTimestamp(right?.order)
  ));
};
