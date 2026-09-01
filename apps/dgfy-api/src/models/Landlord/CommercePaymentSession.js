import { DataTypes } from 'sequelize';

export default (sequelize) => sequelize.define('CommercePaymentSession', {
  session_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  public_reference: {
    type: DataTypes.STRING(40),
    allowNull: false,
    unique: true
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  store_slug: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  provider: {
    type: DataTypes.ENUM('paymongo'),
    allowNull: false,
    defaultValue: 'paymongo'
  },
  target_type: {
    type: DataTypes.ENUM('store_checkout', 'service_booking', 'dglaundry_booking'),
    allowNull: false,
    defaultValue: 'store_checkout'
  },
  status: {
    type: DataTypes.ENUM(
      'created',
      'awaiting_payment',
      'paid',
      'expired',
      'failed',
      'cancelled',
      'finalized',
      'refund_pending',
      'partial_refunded',
      'refunded',
      'paid_manual_resolution_required',
      'split_failed_manual_settlement_required'
    ),
    allowNull: false,
    defaultValue: 'created'
  },
  idempotency_key: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  request_hash: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  checkout_payload: {
    type: DataTypes.JSON,
    allowNull: false
  },
  subtotal_amount: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },
  delivery_fee: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },
  // Phase 237 (#1329, epic #1321, Wave 0 decision #2). The whole resolved delivery-fee breakdown
  // (storeUseCases.js's `delivery` object) plus a `pinned_at` ISO timestamp, captured at
  // payment-session creation and read back by finalizePaidCommerceSession.js on webhook
  // finalization -- see resolveCheckoutContext's pinnedDeliveryBreakdown param. NULL for every
  // pre-Phase-237 session and any session created before this column existed; the replay path
  // treats NULL as "no pin, re-resolve," which is exactly today's (pre-237) behavior.
  delivery_fee_breakdown: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null
  },
  service_fee_amount: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },
  total_amount: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'PHP'
  },
  total_amount_centavos: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  platform_fee_centavos: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  // Phase 141 (#822) -- ADR 0069 clause 1b [binding] (carried forward by ADR 0070). Splits "the
  // order total" from "the amount actually authorized/captured" -- total_amount_centavos above
  // keeps meaning the latter (unchanged), these four columns record the former plus what the split
  // was. DEFAULT 'full' makes every pre-existing row correct by construction.
  capture_kind: {
    type: DataTypes.ENUM('full', 'downpayment'),
    allowNull: false,
    defaultValue: 'full'
  },
  order_total_centavos: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  capture_payment_method: {
    // The online rail that paid the captured amount (e.g. 'gcash', 'qrph') -- so the webhook
    // finalization ledger write needs no checkout_payload re-parse.
    type: DataTypes.STRING(40),
    allowNull: true
  },
  downpayment_refundable: {
    // Policy snapshot at capture time (tenant_downpayment_settings.downpayment_refundable), for
    // Phase 143's (#824) refund-vs-forfeiture decision.
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  fee_policy: {
    type: DataTypes.JSON,
    allowNull: true
  },
  tenant_transfer_merchant_id: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  provider_payment_intent_id: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  provider_payment_method_id: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  provider_payment_id: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  provider_event_id: {
    type: DataTypes.STRING(160),
    allowNull: true
  },
  qr_code_image_url: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  checkout_url: {
    type: DataTypes.STRING(1000),
    allowNull: true
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  paid_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  finalized_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  pos_transaction_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  tracking_pin: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  split_payload: {
    type: DataTypes.JSON,
    allowNull: true
  },
  provider_payload: {
    type: DataTypes.JSON,
    allowNull: true
  },
  failure_code: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  failure_reason: {
    type: DataTypes.STRING(500),
    allowNull: true
  }
}, {
  tableName: 'commerce_payment_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['tenant_id', 'target_type', 'idempotency_key'] },
    { fields: ['tenant_id', 'status'] },
    { fields: ['provider_payment_intent_id'] },
    { fields: ['provider_payment_id'] },
    { fields: ['expires_at'] },
    { fields: ['provider_event_id'], unique: true, name: 'uq_commerce_payment_sessions_provider_event' }
  ]
});
