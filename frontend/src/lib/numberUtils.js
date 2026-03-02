/**
 * Safely format a number to a fixed number of decimal places
 * Handles strings, numbers, null, and undefined values
 * 
 * @param {string|number|null|undefined} value - The value to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted number string
 */
export const formatNumber = (value, decimals = 2) => {
  // Handle null, undefined, or empty string
  if (value === null || value === undefined || value === '') {
    return '0.' + '0'.repeat(decimals);
  }
  
  // Convert string to number
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  
  // Check if conversion resulted in NaN
  if (isNaN(num)) {
    return '0.' + '0'.repeat(decimals);
  }
  
  return num.toFixed(decimals);
};

/**
 * Format a stock quantity for display.
 * Strips trailing zeros and adds thousands separators.
 * Caps at 6 decimal places to handle precise measurements.
 *
 * Examples:
 *   431070.000000000000 → "431,070"
 *   163.000000000000    → "163"
 *   0.5                 → "0.5"
 *   0.000000000000      → "0"
 *
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
export const formatQty = (value) => {
  if (value === null || value === undefined || value === '') return '0';
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
};

