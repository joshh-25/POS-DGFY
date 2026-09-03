const SERVICE_NUMBER_FORMATTER = new Intl.NumberFormat('en-PH', {
  useGrouping: true,
  maximumFractionDigits: 0
});

const SERVICE_MONEY_FORMATTER = new Intl.NumberFormat('en-PH', {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const normalizeServiceNumber = (value) => {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? (numericValue === 0 ? 0 : numericValue) : 0;
};

export const formatServiceNumber = (value) => (
  SERVICE_NUMBER_FORMATTER.format(normalizeServiceNumber(value))
);

export const formatServiceMoney = (value) => (
  `₱${SERVICE_MONEY_FORMATTER.format(normalizeServiceNumber(value))}`
);
