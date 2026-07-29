import { CompanyRegistrationApplication, PlatformInvoice, PlatformInvoiceAdjustment, PlatformInvoiceArtifact, PlatformInvoiceDelivery, PlatformInvoiceEvent, PlatformInvoicePayment, PlatformInvoiceSequence, Tenant, sequelize } from '../../../models/index.js';

const invoiceIncludes = [
  { model: PlatformInvoicePayment, as: 'payments' },
  { model: PlatformInvoiceArtifact, as: 'artifacts' },
  { model: PlatformInvoiceDelivery, as: 'deliveries' },
  { model: PlatformInvoiceAdjustment, as: 'adjustments' },
  { model: PlatformInvoiceEvent, as: 'events' }
];

export const platformInvoiceRepository = {
  transaction: (callback) => sequelize.transaction(callback),
  findApplication(id, transaction) { return CompanyRegistrationApplication.findByPk(id, { transaction }); },
  findOriginalForApplication(registrationApplicationId, transaction) { return PlatformInvoice.findOne({ where: { registration_application_id: registrationApplicationId, invoice_kind: 'original' }, transaction }); },
  findReplacementForParent(parentInvoiceId, transaction) { return PlatformInvoice.findOne({ where: { parent_invoice_id: parentInvoiceId, invoice_kind: 'replacement' }, transaction }); },
  listEligibleApplications() { return CompanyRegistrationApplication.findAll({ where: { review_status: 'approved', provisioning_status: 'succeeded' }, include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name'] }], order: [['created_at', 'DESC']] }); },
  findInvoice(id, transaction, { lock = false } = {}) { return PlatformInvoice.findByPk(id, { transaction, lock: lock ? transaction?.LOCK?.UPDATE : undefined, include: invoiceIncludes }); },
  findArtifact(invoiceId, transaction) { return PlatformInvoiceArtifact.findOne({ where: { invoice_id: invoiceId, artifact_type: 'issued_pdf' }, transaction }); },
  list() { return PlatformInvoice.findAll({ order: [['created_at', 'DESC']], include: invoiceIncludes }); },
  createDraft(payload, transaction) { return PlatformInvoice.create(payload, { transaction }); },
  destroyDraft(invoice, transaction) { return invoice.destroy({ transaction }); },
  createPayment(payload, transaction) { return PlatformInvoicePayment.create(payload, { transaction }); },
  createAdjustment(payload, transaction) { return PlatformInvoiceAdjustment.create(payload, { transaction }); },
  createEvent(payload, transaction) { return PlatformInvoiceEvent.create(payload, { transaction }); },
  createArtifact(payload, transaction) { return PlatformInvoiceArtifact.create(payload, { transaction }); },
  createDelivery(payload, transaction) { return PlatformInvoiceDelivery.create(payload, { transaction }); },
  updateDelivery(delivery, payload, transaction) { return delivery.update(payload, { transaction }); },
  findLatestDelivery(invoiceId) { return PlatformInvoiceDelivery.findOne({ where: { invoice_id: invoiceId }, order: [['created_at', 'DESC']] }); },
  async allocateNumber(mode, transaction) {
    let sequence = await PlatformInvoiceSequence.findOne({ where: { mode }, transaction, lock: transaction.LOCK.UPDATE });
    if (!sequence) {
      try {
        sequence = await PlatformInvoiceSequence.create({ mode, next_value: 1 }, { transaction });
      } catch (error) {
        if (!/unique|duplicate/i.test(error.message || '')) throw error;
        sequence = await PlatformInvoiceSequence.findOne({ where: { mode }, transaction, lock: transaction.LOCK.UPDATE });
      }
    }
    if (!sequence) throw new Error('Platform invoice sequence could not be locked.');
    const current = Number(sequence.next_value);
    await sequence.update({ next_value: current + 1 }, { transaction });
    return `${mode === 'qa' ? 'TEST-' : ''}${String(current).padStart(8, '0')}`;
  }
};
