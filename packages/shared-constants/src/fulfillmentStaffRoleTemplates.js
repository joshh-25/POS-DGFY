// Suggestions copied into ordinary tenant staff_roles at creation time. Editing a
// tenant role never changes these templates, and no authorization checks role names.
export const FULFILLMENT_STAFF_ROLE_TEMPLATES = Object.freeze([
  Object.freeze({
    key: 'warehouse',
    name: 'Warehouse',
    capabilities: Object.freeze(['orders:view_assigned', 'orders:pack', 'delivery_runs:load']),
    modes: Object.freeze(['msme', 'generic'])
  }),
  Object.freeze({
    key: 'delivery',
    name: 'Delivery',
    capabilities: Object.freeze(['delivery_runs:view_assigned', 'delivery_jobs:act_assigned']),
    modes: Object.freeze(['msme', 'generic', 'fnb'])
  })
]);
