import api from './api.js';

/**
 * Search for nearby stores selling a specific item.
 *
 * @param {Object} params
 * @param {string}  params.query      - Item name to search for (e.g. "milk")
 * @param {number}  params.latitude   - User's current latitude
 * @param {number}  params.longitude  - User's current longitude
 * @param {number}  [params.radius=5] - Search radius in km (0.1–50)
 * @param {string}  [params.stockFilter='include_out_of_stock'] - 'in_stock_only' | 'include_out_of_stock'
 * @param {number}  [params.page=1]
 * @param {number}  [params.limit=20]
 * @returns {Promise<{ stores: Array, pagination: Object }>}
 */
export const searchNearbyStores = async ({
    query,
    latitude,
    longitude,
    radius = 5,
    stockFilter = 'include_out_of_stock',
    page = 1,
    limit = 20
}) => {
    const params = new URLSearchParams({
        query,
        latitude,
        longitude,
        radius,
        stock_filter: stockFilter,
        page,
        limit
    });

    const response = await api.get(`/storefront/geo-search?${params.toString()}`);
    return response.data?.data ?? { stores: [], pagination: { page, limit, total: 0, totalPages: 0 } };
};
