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

