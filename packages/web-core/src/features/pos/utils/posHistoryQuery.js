const SALES_STATUS = 'completed';
const SALES_PAYMENT_STATUS = 'paid';

// Keep the page-size choices shared by the query owner and the history footer so
// the control always requests a supported server page size.
export const POS_HISTORY_PAGE_SIZE_OPTIONS = [10, 20, 50];
export const DEFAULT_POS_HISTORY_PAGE_SIZE = 20;

export const normalizePosHistoryPageSize = (value) => {
    const parsed = Number.parseInt(value, 10);
    return POS_HISTORY_PAGE_SIZE_OPTIONS.includes(parsed)
        ? parsed
        : DEFAULT_POS_HISTORY_PAGE_SIZE;
};

/**
 * Build the server query for the POS Sales History view.
 *
 * POS History is a sales view, so its default/completed view must only show
 * financially recognized sales. Voided transactions remain searchable, while
 * pending-sync entries are owned by the local queue and do not need an API call.
 */
export const buildPosHistoryQuery = ({
    historyStatus = 'all',
    page = 1,
    limit = 20,
    search,
    paymentType,
    orderMethod,
    orderSource,
    cashierName,
    dateFrom,
    dateTo,
    locationId
} = {}) => {
    if (historyStatus === 'pending_sync') return null;

    const query = {
        page,
        limit,
        search,
        payment_type: paymentType,
        order_method: orderMethod,
        order_source: orderSource,
        cashier_name: cashierName,
        date_from: dateFrom,
        date_to: dateTo,
        location_id: locationId
    };

    if (historyStatus === 'voided') {
        query.status = 'voided';
    } else {
        query.status = SALES_STATUS;
        query.payment_status = SALES_PAYMENT_STATUS;
    }

    return query;
};
