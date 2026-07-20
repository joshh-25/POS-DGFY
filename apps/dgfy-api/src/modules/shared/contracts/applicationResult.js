/**
 * @template T
 * @typedef {Object} ApplicationResult
 * @property {boolean} success
 * @property {T|null} data
 * @property {Object|null} error
 * @property {string|null} message
 */

/**
 * @template T
 * @param {T} data
 * @param {string|null} [message]
 * @returns {ApplicationResult<T>}
 */
export const ok = (data, message = null) => ({
    success: true,
    data,
    error: null,
    message
});

/**
 * @template T
 * @param {Object} error
 * @param {string|null} [message]
 * @returns {ApplicationResult<T>}
 */
export const fail = (error, message = null) => ({
    success: false,
    data: null,
    error,
    message
});
