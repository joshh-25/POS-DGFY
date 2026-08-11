import Joi from 'joi';

const CHECK_STATUSES = ['open', 'sent_to_kitchen', 'partially_paid', 'paid', 'voided', 'transferred'];
const KITCHEN_TICKET_STATUSES = ['queued', 'preparing', 'ready', 'served', 'cancelled'];
const RESERVATION_STATUSES = ['requested', 'confirmed', 'waitlisted', 'seated', 'cancelled', 'no_show'];
const TABLE_STATUSES = ['available', 'seated', 'held', 'out_of_service'];
const COURSES = ['appetizer', 'main', 'dessert', 'drink', 'other'];

const includeInactiveQuerySchema = Joi.object({
  include_inactive: Joi.boolean().truthy('true').falsy('false').optional()
});

const modifierOptionSchema = Joi.object({
  modifier_option_id: Joi.number().integer().positive().optional(),
  name: Joi.string().trim().min(1).max(120).required(),
  price_delta: Joi.number().precision(4).default(0),
  sku_item_id: Joi.number().integer().positive().allow(null).optional(),
  is_default: Joi.boolean().default(false),
  is_active: Joi.boolean().default(true),
  visible_in_pos: Joi.boolean().default(true),
  visible_in_storefront: Joi.boolean().default(true),
  is_sold_out: Joi.boolean().default(false),
  allergen_notes: Joi.array().items(Joi.string().trim().max(120)).allow(null).optional(),
  sort_order: Joi.number().integer().min(0).optional(),
  location_availability: Joi.array().items(Joi.object({
    location_id: Joi.number().integer().positive().required(),
    is_available: Joi.boolean().default(true),
    is_sold_out: Joi.boolean().default(false)
  })).default([])
});

const modifierGroupSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  display_name: Joi.string().trim().max(120).allow('', null).optional(),
  group_kind: Joi.string().valid('modifier', 'combo_choice').default('modifier'),
  parent_modifier_option_id: Joi.number().integer().positive().allow(null).optional(),
  min_select: Joi.number().integer().min(0).default(0),
  max_select: Joi.number().integer().min(1).default(1),
  required: Joi.boolean().default(false),
  is_active: Joi.boolean().default(true),
  visible_in_pos: Joi.boolean().default(true),
  visible_in_storefront: Joi.boolean().default(true),
  sort_order: Joi.number().integer().min(0).default(0),
  options: Joi.array().items(modifierOptionSchema).default([]),
  location_availability: Joi.array().items(Joi.object({
    location_id: Joi.number().integer().positive().required(),
    is_available: Joi.boolean().default(true)
  })).default([])
});

const modifierGroupIdParamSchema = Joi.object({ modifier_group_id: Joi.number().integer().positive().required() });

const diningTableSchema = Joi.object({
  table_number: Joi.string().trim().max(40).allow('', null).optional(),
  label: Joi.string().trim().max(120).allow('', null).optional(),
  seat_count: Joi.number().integer().min(1).max(100).default(2),
  status: Joi.string().valid(...TABLE_STATUSES).default('available'),
  qr_slug: Joi.string().trim().max(120).allow('', null).optional(),
  is_active: Joi.boolean().default(true)
});

const diningAreaSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  service_type: Joi.string().valid('dine_in', 'outdoor', 'bar', 'private_room').default('dine_in'),
  is_active: Joi.boolean().default(true),
  sort_order: Joi.number().integer().min(0).default(0),
  tables: Joi.array().items(diningTableSchema).default([])
});

const tableIdParamSchema = Joi.object({
  table_id: Joi.number().integer().positive().required()
});

const tableStatusSchema = Joi.object({
  status: Joi.string().valid(...TABLE_STATUSES).required()
});

const kitchenStationSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  station_type: Joi.string().valid('hot_line', 'cold_line', 'bar', 'dessert', 'expo', 'prep', 'other').default('hot_line'),
  ticket_prefix: Joi.string().trim().max(20).allow('', null).optional(),
  is_active: Joi.boolean().default(true),
  sort_order: Joi.number().integer().min(0).default(0)
});

const itemIdParamSchema = Joi.object({
  item_id: Joi.number().integer().positive().required()
});

const itemAssignmentQuerySchema = Joi.object({
  item_id: Joi.number().integer().positive().optional()
});

const folderIdParamSchema = Joi.object({
  folder_id: Joi.number().integer().positive().required()
});

const folderAssignmentQuerySchema = Joi.object({
  folder_id: Joi.number().integer().positive().optional()
});

const itemKitchenRouteSchema = Joi.object({
  kitchen_station_id: Joi.number().integer().positive().required(),
  default_course: Joi.string().valid(...COURSES).default('main')
});

const itemModifierAssignmentSchema = Joi.object({
  modifier_group_id: Joi.number().integer().positive().required(),
  is_required_override: Joi.boolean().allow(null).optional(),
  is_excluded: Joi.boolean().optional(),
  sort_order: Joi.number().integer().min(0).optional()
});

const folderModifierAssignmentSchema = Joi.object({
  modifier_group_id: Joi.number().integer().positive().required(),
  is_required_override: Joi.boolean().allow(null).optional(),
  sort_order: Joi.number().integer().min(0).optional()
});

const itemModifierGroupsSchema = Joi.object({
  modifier_groups: Joi.array().items(itemModifierAssignmentSchema).default([])
});

const folderModifierGroupsSchema = Joi.object({
  modifier_groups: Joi.array().items(folderModifierAssignmentSchema).default([])
});

const checksQuerySchema = Joi.object({
  status: Joi.string().valid(...CHECK_STATUSES).optional(),
  statuses: Joi.string().trim().max(255).optional(),
  limit: Joi.number().integer().min(1).max(300).default(100)
});

const checkSchema = Joi.object({
  table_id: Joi.number().integer().positive().allow(null).optional(),
  dining_area_id: Joi.number().integer().positive().allow(null).optional(),
  server_id: Joi.number().integer().positive().allow(null).optional(),
  guest_count: Joi.number().integer().min(1).max(500).default(1),
  order_method: Joi.string().valid('dine_in', 'takeout', 'pickup', 'delivery').default('dine_in'),
  notes: Joi.string().trim().max(4000).allow('', null).optional()
});

const checkIdParamSchema = Joi.object({
  check_id: Joi.number().integer().positive().required()
});

const checkStatusSchema = Joi.object({
  status: Joi.string().valid(...CHECK_STATUSES).required(),
  pos_transaction_id: Joi.number().integer().positive().allow(null).optional()
});

const transferCheckSchema = Joi.object({
  table_id: Joi.number().integer().positive().required(),
  server_id: Joi.number().integer().positive().allow(null).optional(),
  notes: Joi.string().trim().max(4000).allow('', null).optional()
});

const splitCheckSchema = Joi.object({
  line_ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
  table_id: Joi.number().integer().positive().allow(null).optional(),
  dining_area_id: Joi.number().integer().positive().allow(null).optional(),
  server_id: Joi.number().integer().positive().allow(null).optional(),
  guest_count: Joi.number().integer().min(1).max(500).default(1),
  notes: Joi.string().trim().max(4000).allow('', null).optional()
});

const mergeChecksSchema = Joi.object({
  source_check_id: Joi.number().integer().positive().required(),
  notes: Joi.string().trim().max(4000).allow('', null).optional()
});

const checkLineSchema = Joi.object({
  item_id: Joi.number().integer().positive().required(),
  quantity: Joi.number().positive().precision(4).default(1),
  course: Joi.string().valid(...COURSES).default('main'),
  modifiers: Joi.array().items(Joi.object().unknown(true)).default([]),
  special_instructions: Joi.string().trim().max(1000).allow('', null).optional(),
  kitchen_station_id: Joi.number().integer().positive().allow(null).optional()
});

const kitchenTicketSchema = Joi.object({
  kitchen_station_id: Joi.number().integer().positive().allow(null).optional(),
  ticket_number: Joi.string().trim().max(50).allow('', null).optional(),
  lines_snapshot: Joi.array().items(Joi.object().unknown(true)).optional()
});

const ticketIdParamSchema = Joi.object({
  ticket_id: Joi.number().integer().positive().required()
});

const ticketStatusSchema = Joi.object({
  status: Joi.string().valid(...KITCHEN_TICKET_STATUSES).required()
});

const reservationsQuerySchema = Joi.object({
  status: Joi.string().valid(...RESERVATION_STATUSES).optional(),
  table_id: Joi.number().integer().positive().optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(300).default(100)
});

const reservationSchema = Joi.object({
  public_reference: Joi.string().trim().max(40).allow('', null).optional(),
  customer_name: Joi.string().trim().min(1).max(255).required(),
  customer_email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase().max(255).allow('', null).optional(),
  customer_phone: Joi.string().trim().max(50).allow('', null).optional(),
  party_size: Joi.number().integer().min(1).max(500).default(2),
  requested_at: Joi.date().iso().required(),
  duration_minutes: Joi.number().integer().min(15).max(480).default(90),
  buffer_minutes: Joi.number().integer().min(0).max(120).default(15),
  table_id: Joi.number().integer().positive().allow(null).optional(),
  table_ids: Joi.array().items(Joi.number().integer().positive()).max(12).optional(),
  notes: Joi.string().trim().max(4000).allow('', null).optional()
});

const reservationIdParamSchema = Joi.object({
  reservation_id: Joi.number().integer().positive().required()
});

const reservationStatusSchema = Joi.object({
  status: Joi.string().valid(...RESERVATION_STATUSES).required(),
  table_id: Joi.number().integer().positive().allow(null).optional(),
  table_ids: Joi.array().items(Joi.number().integer().positive()).max(12).optional(),
  party_size: Joi.number().integer().min(1).max(500).optional(),
  requested_at: Joi.date().iso().optional(),
  duration_minutes: Joi.number().integer().min(15).max(480).optional(),
  buffer_minutes: Joi.number().integer().min(0).max(120).optional(),
  notes: Joi.string().trim().max(4000).allow('', null).optional()
});

const serviceChargeSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  label: Joi.string().trim().max(120).allow('', null).default('Restaurant service charge'),
  rate: Joi.number().min(0).max(100).precision(4).default(0),
  taxable: Joi.boolean().default(false)
});

const buildValidationErrorResponse = (error) => ({
  success: false,
  data: null,
  message: 'Validation failed',
  errors: error.details.map((detail) => ({
    field: detail.path.join('.'),
    message: detail.message
  })),
  timestamp: new Date().toISOString()
});

const validateSchema = (schema, source, target) => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    stripUnknown: true
  });
  if (error) return res.status(422).json(buildValidationErrorResponse(error));
  req[target] = value;
  return next();
};

export const validateFnbIncludeInactiveQuery = validateSchema(includeInactiveQuerySchema, 'query', 'validatedQuery');
export const validateCreateFnbModifierGroup = validateSchema(modifierGroupSchema, 'body', 'validatedData');
export const validateFnbModifierGroupIdParam = validateSchema(modifierGroupIdParamSchema, 'params', 'validatedParams');
export const validateUpdateFnbModifierGroup = validateSchema(modifierGroupSchema, 'body', 'validatedData');
export const validateCreateFnbDiningArea = validateSchema(diningAreaSchema, 'body', 'validatedData');
export const validateFnbTableIdParam = validateSchema(tableIdParamSchema, 'params', 'validatedParams');
export const validateUpdateFnbTableStatus = validateSchema(tableStatusSchema, 'body', 'validatedData');
export const validateCreateFnbKitchenStation = validateSchema(kitchenStationSchema, 'body', 'validatedData');
export const validateFnbItemIdParam = validateSchema(itemIdParamSchema, 'params', 'validatedParams');
export const validateFnbItemAssignmentQuery = validateSchema(itemAssignmentQuerySchema, 'query', 'validatedQuery');
export const validateFnbFolderIdParam = validateSchema(folderIdParamSchema, 'params', 'validatedParams');
export const validateFnbFolderAssignmentQuery = validateSchema(folderAssignmentQuerySchema, 'query', 'validatedQuery');
export const validateUpsertFnbItemKitchenRoute = validateSchema(itemKitchenRouteSchema, 'body', 'validatedData');
export const validateReplaceFnbItemModifierGroups = validateSchema(itemModifierGroupsSchema, 'body', 'validatedData');
export const validateReplaceFnbFolderModifierGroups = validateSchema(folderModifierGroupsSchema, 'body', 'validatedData');
export const validateFnbChecksQuery = validateSchema(checksQuerySchema, 'query', 'validatedQuery');
export const validateCreateFnbCheck = validateSchema(checkSchema, 'body', 'validatedData');
export const validateFnbCheckIdParam = validateSchema(checkIdParamSchema, 'params', 'validatedParams');
export const validateUpdateFnbCheckStatus = validateSchema(checkStatusSchema, 'body', 'validatedData');
export const validateTransferFnbCheck = validateSchema(transferCheckSchema, 'body', 'validatedData');
export const validateSplitFnbCheck = validateSchema(splitCheckSchema, 'body', 'validatedData');
export const validateMergeFnbChecks = validateSchema(mergeChecksSchema, 'body', 'validatedData');
export const validateCreateFnbCheckLine = validateSchema(checkLineSchema, 'body', 'validatedData');
export const validateCreateFnbKitchenTicket = validateSchema(kitchenTicketSchema, 'body', 'validatedData');
export const validateFnbTicketIdParam = validateSchema(ticketIdParamSchema, 'params', 'validatedParams');
export const validateUpdateFnbTicketStatus = validateSchema(ticketStatusSchema, 'body', 'validatedData');
export const validateFnbReservationsQuery = validateSchema(reservationsQuerySchema, 'query', 'validatedQuery');
export const validateCreateFnbReservation = validateSchema(reservationSchema, 'body', 'validatedData');
export const validateFnbReservationIdParam = validateSchema(reservationIdParamSchema, 'params', 'validatedParams');
export const validateUpdateFnbReservationStatus = validateSchema(reservationStatusSchema, 'body', 'validatedData');
export const validateUpdateFnbServiceCharge = validateSchema(serviceChargeSchema, 'body', 'validatedData');
