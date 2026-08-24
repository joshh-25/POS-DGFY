import { differenceInDays, format, isPast } from 'date-fns';

/**
 * Check if a batch is near expiry (≤30 days)
 * @param {string|Date} expiryDate - The expiry date to check
 * @returns {boolean} True if expiring within 30 days
 */
export const isNearExpiry = (expiryDate) => {
  if (!expiryDate) return false;
  const days = differenceInDays(new Date(expiryDate), new Date());
  return days <= 30 && days > 0;
};

/**
 * Check if a batch is expired
 * @param {string|Date} expiryDate - The expiry date to check
 * @returns {boolean} True if expired
 */
export const isExpired = (expiryDate) => {
  if (!expiryDate) return false;
  return isPast(new Date(expiryDate));
};

/**
 * Calculate days until expiry
 * @param {string|Date} expiryDate - The expiry date
 * @returns {number|null} Days until expiry (negative if expired)
 */
export const getDaysUntilExpiry = (expiryDate) => {
  if (!expiryDate) return null;
  return Math.ceil(differenceInDays(new Date(expiryDate), new Date()));
};

/**
 * Get expiry status with severity level
 * @param {string|Date} expiryDate - The expiry date
 * @returns {Object|null} Status object with status and severity
 */
export const getExpiryStatus = (expiryDate) => {
  if (!expiryDate) return null;

  if (isExpired(expiryDate)) {
    return { status: 'expired', severity: 'critical' };
  }

  if (isNearExpiry(expiryDate)) {
    return { status: 'expiring', severity: 'warning' };
  }

  return { status: 'healthy', severity: 'info' };
};

/**
 * Get the next (earliest) expiry date from an item's FIFO batches
 * @param {Object} item - Item object with fifo_batches array
 * @returns {string|null} Earliest expiry date or null
 */
export const getNextExpiryDate = (item) => {
  if (!item.fifo_enabled || !item.fifo_batches || item.fifo_batches.length === 0) {
    return null;
  }

  // Filter batches with expiry dates and sort by expiry date (earliest first)
  const batchesWithExpiry = item.fifo_batches
    .filter(batch => batch.expiry_date)
    .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));

  return batchesWithExpiry.length > 0 ? batchesWithExpiry[0].expiry_date : null;
};

/**
 * Format expiry date with contextual description
 * @param {string|Date} expiryDate - The expiry date
 * @returns {string} Formatted expiry date with context
 */
export const formatExpiryDate = (expiryDate) => {
  if (!expiryDate) return 'No expiry date';

  const days = getDaysUntilExpiry(expiryDate);
  const dateStr = format(new Date(expiryDate), 'MMM d, yyyy');

  if (days < 0) {
    return `Expired ${Math.abs(days)} days ago (${dateStr})`;
  } else if (days === 0) {
    return `Expires today (${dateStr})`;
  } else if (days === 1) {
    return `Expires tomorrow (${dateStr})`;
  } else if (days <= 7) {
    return `Expires in ${days} days (${dateStr})`;
  } else {
    return dateStr;
  }
};

/**
 * Count expiring batches by severity across all items
 * @param {Array} items - Array of item objects
 * @returns {Object} Counts object with expired, expiring, and critical counts
 */
export const countExpiringBatches = (items) => {
  const counts = {
    expired: 0,
    expiring: 0, // within 30 days
    critical: 0, // within 7 days
  };

  items.forEach(item => {
    if (!item.fifo_enabled || !item.fifo_batches) return;

    item.fifo_batches.forEach(batch => {
      if (!batch.expiry_date) return;

      const days = getDaysUntilExpiry(batch.expiry_date);

      if (days < 0) {
        counts.expired++;
      } else if (days <= 7) {
        counts.critical++;
        counts.expiring++;
      } else if (days <= 30) {
        counts.expiring++;
      }
    });
  });

  return counts;
};
