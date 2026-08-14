import api from './api';

/**
 * Get stock level forecasts
 * @param {number} daysAhead - Number of days to forecast (default 30)
 * @returns {Promise<Object>} - Forecast data
 */
export const getStockForecast = async (daysAhead = 30) => {
    return api.get(`/forecast/stock-levels?days=${daysAhead}`);
};
