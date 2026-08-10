export const REQUIRED_INDEX_CONTRACT = Object.freeze({
    items: Object.freeze({
        single: Object.freeze(['sku_code', 'category', 'folder_id', 'deleted_at', 'status']),
        composite: Object.freeze([])
    }),
    stock_movements: Object.freeze({
        single: Object.freeze(['item_id', 'batch_id', 'movement_type', 'timestamp']),
        composite: Object.freeze([Object.freeze(['item_id', 'movement_type', 'timestamp'])])
    }),
    job_orders: Object.freeze({
        single: Object.freeze(['product_id', 'status']),
        composite: Object.freeze([])
    }),
    jo_ingredients: Object.freeze({
        single: Object.freeze(['item_id', 'batch_id']),
        composite: Object.freeze([])
    })
});

export const REQUIRED_INDEX_TABLES = Object.freeze(Object.keys(REQUIRED_INDEX_CONTRACT));
