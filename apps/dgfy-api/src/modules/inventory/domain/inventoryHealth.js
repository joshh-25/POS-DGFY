import { Op } from 'sequelize';

export const STOCK_HEALTH_STATUS = Object.freeze({
  OUT_OF_STOCK: 'out_of_stock',
  LOW_STOCK: 'low_stock',
  HEALTHY: 'healthy',
  OVERSTOCK: 'overstock',
  UNCONFIGURED: 'unconfigured'
});

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Canonical, read-only classification for a stock-bearing item.
 *
 * Thresholds are optional while an item is being configured. Those rows are
 * intentionally exposed as `unconfigured` instead of being silently counted
 * as healthy or overstocked. Out-of-stock is exclusive and takes precedence
 * over the low-stock threshold.
 */
export const getStockHealthStatus = ({
  currentStock = 0,
  minThreshold = null,
  maxCapacity = null
} = {}) => {
  const current = toNumber(currentStock);
  const min = toNullableNumber(minThreshold);
  const max = toNullableNumber(maxCapacity);

  if (current <= 0) return STOCK_HEALTH_STATUS.OUT_OF_STOCK;
  if (min !== null && current <= min) return STOCK_HEALTH_STATUS.LOW_STOCK;
  if (max !== null && current > max) return STOCK_HEALTH_STATUS.OVERSTOCK;
  if (min === null && max === null) return STOCK_HEALTH_STATUS.UNCONFIGURED;
  return STOCK_HEALTH_STATUS.HEALTHY;
};

export const getStockHealthCounts = (rows = []) => {
  const counts = {
    [STOCK_HEALTH_STATUS.LOW_STOCK]: 0,
    [STOCK_HEALTH_STATUS.OUT_OF_STOCK]: 0,
    [STOCK_HEALTH_STATUS.HEALTHY]: 0,
    [STOCK_HEALTH_STATUS.OVERSTOCK]: 0,
    [STOCK_HEALTH_STATUS.UNCONFIGURED]: 0
  };

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const status = getStockHealthStatus({
      currentStock: row?.current_stock ?? row?.quantity_on_hand,
      minThreshold: row?.min_threshold,
      maxCapacity: row?.max_capacity
    });
    counts[status] += 1;
  });

  return counts;
};

const compare = (sequelize, column, operator, value) => (
  sequelize.where(sequelize.col(column), operator, value)
);

const stockHealthConditions = ({
  status,
  sequelize,
  stockColumn,
  minColumn,
  maxColumn
}) => {
  const stockIsPositive = compare(sequelize, stockColumn, Op.gt, 0);
  const stockIsEmpty = compare(sequelize, stockColumn, Op.lte, 0);
  const minIsConfigured = compare(sequelize, minColumn, Op.ne, null);
  const minIsMissing = compare(sequelize, minColumn, Op.is, null);
  const maxIsConfigured = compare(sequelize, maxColumn, Op.ne, null);
  const maxIsMissing = compare(sequelize, maxColumn, Op.is, null);
  const atOrBelowMin = compare(sequelize, stockColumn, Op.lte, sequelize.col(minColumn));
  const aboveMin = compare(sequelize, stockColumn, Op.gt, sequelize.col(minColumn));
  const atOrBelowMax = compare(sequelize, stockColumn, Op.lte, sequelize.col(maxColumn));
  const aboveMax = compare(sequelize, stockColumn, Op.gt, sequelize.col(maxColumn));

  switch (status) {
    case STOCK_HEALTH_STATUS.OUT_OF_STOCK:
      return [stockIsEmpty];
    case STOCK_HEALTH_STATUS.LOW_STOCK:
      return [stockIsPositive, minIsConfigured, atOrBelowMin];
    case STOCK_HEALTH_STATUS.OVERSTOCK:
      return [stockIsPositive, maxIsConfigured, aboveMax];
    case STOCK_HEALTH_STATUS.HEALTHY:
      return [
        stockIsPositive,
        { [Op.or]: [minIsMissing, aboveMin] },
        { [Op.or]: [maxIsMissing, atOrBelowMax] },
        { [Op.or]: [minIsConfigured, maxIsConfigured] }
      ];
    case STOCK_HEALTH_STATUS.UNCONFIGURED:
      return [stockIsPositive, minIsMissing, maxIsMissing];
    default:
      return [];
  }
};

/**
 * Build the canonical Sequelize predicate used by inventory-health readers.
 * The caller can pass several statuses to create one attention queue without
 * reimplementing the precedence rules in each repository.
 */
export const buildStockHealthWhere = ({
  status = null,
  statuses = null,
  sequelize,
  stockColumn = 'current_stock',
  minColumn = 'min_threshold',
  maxColumn = 'max_capacity'
} = {}) => {
  if (!sequelize?.where || !sequelize?.col) {
    throw new Error('A Sequelize instance is required to build stock-health predicates.');
  }

  const requestedStatuses = Array.isArray(statuses)
    ? statuses
    : status
      ? [status]
      : [];
  const predicates = requestedStatuses.flatMap((requestedStatus) => (
    stockHealthConditions({
      status: requestedStatus,
      sequelize,
      stockColumn,
      minColumn,
      maxColumn
    })
  ));

  if (requestedStatuses.length <= 1) return { [Op.and]: predicates };

  const perStatus = requestedStatuses.map((requestedStatus) => ({
    [Op.and]: stockHealthConditions({
      status: requestedStatus,
      sequelize,
      stockColumn,
      minColumn,
      maxColumn
    })
  }));
  return { [Op.or]: perStatus };
};

/**
 * Build the same health decision tree for a trusted, internal SQL projection.
 * Expressions are supplied by repository code, never by request input. The
 * optional labels preserve a legacy report's public vocabulary while keeping
 * its threshold logic owned by this contract.
 */
export const buildStockHealthSqlCase = ({
  stockExpression,
  minExpression,
  maxExpression,
  labels = {}
} = {}) => {
  const stock = String(stockExpression || '').trim();
  const min = String(minExpression || '').trim();
  const max = String(maxExpression || '').trim();
  if (!stock || !min || !max) {
    throw new Error('Stock, minimum, and maximum SQL expressions are required.');
  }

  const statusLabels = {
    [STOCK_HEALTH_STATUS.OUT_OF_STOCK]: labels[STOCK_HEALTH_STATUS.OUT_OF_STOCK] || STOCK_HEALTH_STATUS.OUT_OF_STOCK,
    [STOCK_HEALTH_STATUS.LOW_STOCK]: labels[STOCK_HEALTH_STATUS.LOW_STOCK] || STOCK_HEALTH_STATUS.LOW_STOCK,
    [STOCK_HEALTH_STATUS.OVERSTOCK]: labels[STOCK_HEALTH_STATUS.OVERSTOCK] || STOCK_HEALTH_STATUS.OVERSTOCK,
    [STOCK_HEALTH_STATUS.UNCONFIGURED]: labels[STOCK_HEALTH_STATUS.UNCONFIGURED] || STOCK_HEALTH_STATUS.UNCONFIGURED,
    [STOCK_HEALTH_STATUS.HEALTHY]: labels[STOCK_HEALTH_STATUS.HEALTHY] || STOCK_HEALTH_STATUS.HEALTHY
  };

  return `CASE
    WHEN (${stock}) <= 0 THEN '${statusLabels[STOCK_HEALTH_STATUS.OUT_OF_STOCK]}'
    WHEN ${min} IS NOT NULL AND (${stock}) > 0 AND (${stock}) <= ${min} THEN '${statusLabels[STOCK_HEALTH_STATUS.LOW_STOCK]}'
    WHEN ${max} IS NOT NULL AND (${stock}) > 0 AND (${stock}) > ${max} THEN '${statusLabels[STOCK_HEALTH_STATUS.OVERSTOCK]}'
    WHEN ${min} IS NULL AND ${max} IS NULL THEN '${statusLabels[STOCK_HEALTH_STATUS.UNCONFIGURED]}'
    ELSE '${statusLabels[STOCK_HEALTH_STATUS.HEALTHY]}'
  END`;
};

/**
 * Shared expiry bucket classification for alert and report consumers.
 */
export const classifyExpiry = ({
  daysUntilExpiry,
  criticalDays = 7,
  warningDays = 30,
  upcomingDays = warningDays
} = {}) => {
  const days = Number(daysUntilExpiry);
  if (!Number.isFinite(days)) return null;

  if (days < 0) return 'expired';
  if (days <= Number(criticalDays)) return 'critical';
  if (days <= Number(warningDays)) return 'warning';
  if (days <= Number(upcomingDays)) return 'upcoming';
  return null;
};

export default {
  STOCK_HEALTH_STATUS,
  getStockHealthStatus,
  getStockHealthCounts,
  buildStockHealthWhere,
  buildStockHealthSqlCase,
  classifyExpiry
};
