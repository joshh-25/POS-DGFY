import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    toValidDate,
    maxDate,
    buildWebhookDedupKey,
    extendOneCalendarMonth
} from './paymentDateUtils.js';
import { emitBillingFunnelEvent } from '../../../services/billingFunnelTelemetryService.js';

export const buildHandleWebhookUseCase = ({
    paymentRepository,
    paypalService,
    paymongoService,
    trackEngagementEvent,
    emailService,
    logger
}) => {
    const emitWebhookEvent = (eventType, options = {}) => emitBillingFunnelEvent({
        trackEngagementEvent,
        eventType,
        source: options.source || 'payments.webhook',
        route: '/api/v1/payments/webhook',
        requestId: options.requestId ?? options.correlationId ?? null,
        tenantId: options.tenantId ?? null,
        subscriptionId: options.subscriptionId ?? null,
        correlationId: options.correlationId ?? null,
        providerEventId: options.providerEventId ?? null,
        providerEventTime: options.providerEventTime ?? null,
        metadata: options.metadata || {},
        outcome: options.outcome || null,
        failureCode: options.failureCode || null,
        failureReason: options.failureReason || null,
        httpStatus: options.httpStatus ?? null,
        useIdempotency: options.useIdempotency ?? true
    });

    async function handlePaymentCompleted(resource) {
        const subscriptionId = resource?.billing_agreement_id;
        const transactionId = resource?.id;
        const amount = resource?.amount?.total;
        const currency = resource?.amount?.currency;

        if (!subscriptionId) {
            logger.warn('Payment event missing billing_agreement_id', resource);
            await emitWebhookEvent('paypal_payment_sale_failed_missing_subscription', {
                correlationId: transactionId,
                outcome: 'failed',
                failureCode: 'missing_subscription_id',
                failureReason: 'missing_billing_agreement_id',
                httpStatus: 400,
                metadata: {
                    transaction_id: transactionId
                }
            });
            return;
        }

        const tenant = await paymentRepository.findTenantBySubscriptionId(subscriptionId);
        if (!tenant) {
            logger.error(`Tenant not found for subscription: ${subscriptionId}`);
            await emitWebhookEvent('paypal_payment_sale_ignored_unknown_tenant', {
                subscriptionId,
                correlationId: transactionId,
                outcome: 'ignored',
                failureCode: 'unknown_tenant',
                failureReason: 'subscription_not_mapped_to_tenant',
                metadata: {
                    transaction_id: transactionId
                }
            });
            return;
        }

        await paymentRepository.runInTransaction(async (transaction) => {
            try {
                await paymentRepository.createPayment({
                    tenant_id: tenant.id,
                    transaction_id: transactionId,
                    amount,
                    currency,
                    status: 'completed',
                    payment_method: 'paypal',
                    metadata: resource
                }, { transaction });
            } catch (error) {
                if (error?.name === 'SequelizeUniqueConstraintError') {
                    logger.info(`Duplicate payment transaction ${transactionId} detected. Skipping tenant mutation.`);
                    return;
                }
                throw error;
            }

            let nextBillingDate;
            let authoritativeDateUsed = false;
            const paypalNextBillingDate = toValidDate(resource?.next_billing_date)
                || toValidDate(resource?.billing_info?.next_billing_time);

            if (paypalNextBillingDate) {
                nextBillingDate = paypalNextBillingDate;
                authoritativeDateUsed = true;
            } else {
                const now = new Date();
                const base = tenant.current_period_end && tenant.current_period_end > now
                    ? tenant.current_period_end
                    : now;
                const anchor = tenant.billing_cycle_anchor || new Date(base).getDate();
                nextBillingDate = extendOneCalendarMonth(base, anchor);
            }

            const currentEnd = toValidDate(tenant.current_period_end);
            nextBillingDate = maxDate(nextBillingDate, currentEnd);
            if (!nextBillingDate) {
                throw new Error('Unable to resolve next billing date');
            }

            // Apply deferred plan change if one was queued and approved on PayPal
            if (tenant.pending_plan && tenant.pending_plan_approved) {
                const oldPlan = tenant.plan;
                tenant.plan = tenant.pending_plan;
                tenant.pending_plan = null;
                tenant.pending_plan_approved = false;
                tenant.pending_plan_change_date = null;
                logger.info(`Applying deferred plan change for tenant ${tenant.name}: ${oldPlan} -> ${tenant.plan}`);
                if (emailService?.isEmailConfigured?.()) {
                    emailService.sendPlanChangeAppliedEmail({
                        email: tenant.admin_email,
                        companyName: tenant.name,
                        oldPlan,
                        newPlan: tenant.plan
                    }).catch(err => logger.warn('Email send failed (plan change applied webhook):', err.message));
                }
            } else {
                // Keep plan aligned with the subscription unless a pending change is waiting
                if (!tenant.pending_plan) {
                    tenant.plan = tenant.plan || 'standard';
                }
            }

            tenant.subscription_status = 'active';
            tenant.current_period_end = nextBillingDate;

            if (authoritativeDateUsed) {
                tenant.billing_cycle_anchor = nextBillingDate.getDate();
            } else if (!tenant.billing_cycle_anchor) {
                tenant.billing_cycle_anchor = nextBillingDate.getDate();
            }

            await tenant.save({ transaction });
            logger.info(`Payment verified for tenant ${tenant.name}. Subscription extended to ${nextBillingDate}.`);
        });

        await emitWebhookEvent('paypal_payment_sale_completed', {
            tenantId: tenant.id,
            subscriptionId,
            correlationId: transactionId,
            outcome: 'succeeded',
            metadata: {
                transaction_id: transactionId,
                currency
            }
        });
    }

    async function handleSubscriptionActivated(resource) {
        const subscriptionId = resource?.id;

        // Try active subscription ID first, then admin-initiated pending subscription
        let tenant = await paymentRepository.findTenantBySubscriptionId(subscriptionId);
        let wasAdminInitiated = false;

        if (!tenant) {
            tenant = await paymentRepository.findTenantByPendingSubscriptionId(subscriptionId);
            if (tenant) {
                wasAdminInitiated = true;
            }
        }

        if (!tenant) {
            logger.warn(`Subscription activated for unknown tenant: ${subscriptionId}`);
            await emitWebhookEvent('paypal_subscription_event_ignored_unknown_tenant', {
                subscriptionId,
                correlationId: subscriptionId,
                outcome: 'ignored',
                failureCode: 'unknown_tenant',
                failureReason: 'subscription_not_mapped_to_tenant',
                metadata: {
                    paypal_event_type: 'BILLING.SUBSCRIPTION.ACTIVATED'
                }
            });
            return;
        }

        // Resolve plan from PayPal plan_id (supports both Standard and Premium)
        const paypalPlanId = resource?.plan_id;
        let resolvedPlan = tenant.plan; // default: keep existing
        if (paypalPlanId) {
            if (paypalPlanId === process.env.PAYPAL_PREMIUM_PLAN_ID) {
                resolvedPlan = 'premium';
            } else if (paypalPlanId === process.env.PAYPAL_STANDARD_PLAN_ID) {
                resolvedPlan = 'standard';
            }
        }

        const updates = {
            plan: resolvedPlan,
            subscription_status: 'active',
            billing_cycle_anchor: tenant.billing_cycle_anchor || new Date().getDate()
        };

        if (wasAdminInitiated) {
            // Promote the pending subscription to the active one
            updates.paypal_subscription_id = subscriptionId;
            updates.payment_method = 'paypal';
            updates.pending_paypal_subscription_id = null;
            updates.paypal_setup_initiated_at = null;
            logger.info(`Admin-initiated PayPal subscription activated for tenant ${tenant.name}`);
        }

        await tenant.update(updates);
        logger.info(`Subscription activated for tenant ${tenant.name} (plan: ${resolvedPlan})`);

        await emitWebhookEvent('paypal_subscription_activated', {
            tenantId: tenant.id,
            subscriptionId,
            correlationId: subscriptionId,
            outcome: 'succeeded',
            metadata: {
                paypal_event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
                was_admin_initiated: wasAdminInitiated,
                plan: resolvedPlan
            }
        });
    }

    async function handleSubscriptionUpdated(resource) {
        const subscriptionId = resource?.id;
        const paypalPlanId = resource?.plan_id;

        // Try to find by active subscription, then by pending
        let tenant = await paymentRepository.findTenantBySubscriptionId(subscriptionId);
        if (!tenant) {
            tenant = await paymentRepository.findTenantByPendingSubscriptionId(subscriptionId);
        }

        if (!tenant) {
            logger.warn(`Subscription updated event for unknown subscription: ${subscriptionId}`);
            return;
        }

        // If tenant has a pending_plan, check if PayPal confirms the plan change
        if (tenant.pending_plan && paypalPlanId) {
            const targetPlanId = tenant.pending_plan === 'premium'
                ? process.env.PAYPAL_PREMIUM_PLAN_ID
                : process.env.PAYPAL_STANDARD_PLAN_ID;

            if (targetPlanId && paypalPlanId === targetPlanId) {
                await tenant.update({ pending_plan_approved: true });
                logger.info(`Plan revision approved for tenant ${tenant.name}: pending_plan=${tenant.pending_plan}`);
            }
        }

        await emitWebhookEvent('paypal_subscription_updated', {
            tenantId: tenant.id,
            subscriptionId,
            correlationId: subscriptionId,
            outcome: 'succeeded',
            metadata: {
                paypal_event_type: 'BILLING.SUBSCRIPTION.UPDATED',
                plan_id: paypalPlanId
            }
        });
    }

    async function handleSubscriptionCancelled(resource) {
        const subscriptionId = resource?.id;
        const tenant = await paymentRepository.findTenantBySubscriptionId(subscriptionId);

        if (!tenant) {
            logger.warn(`Subscription cancelled for unknown tenant: ${subscriptionId}`);
            await emitWebhookEvent('paypal_subscription_event_ignored_unknown_tenant', {
                subscriptionId,
                correlationId: subscriptionId,
                outcome: 'ignored',
                failureCode: 'unknown_tenant',
                failureReason: 'subscription_not_mapped_to_tenant',
                metadata: {
                    paypal_event_type: 'BILLING.SUBSCRIPTION.CANCELLED'
                }
            });
            return;
        }

        tenant.subscription_status = 'cancelled';
        tenant.cancelled_at = new Date();
        await tenant.save();
        logger.info(`Subscription cancelled for tenant ${tenant.name}`);
        await emitWebhookEvent('paypal_subscription_cancelled', {
            tenantId: tenant.id,
            subscriptionId,
            correlationId: subscriptionId,
            outcome: 'succeeded',
            metadata: {
                paypal_event_type: 'BILLING.SUBSCRIPTION.CANCELLED'
            }
        });
    }

    async function handlePayMongoPaymentPaid(resource) {
        const payload = resource?.attributes?.data || resource || {};
        const paymentId = payload?.id;
        const attrs = payload?.attributes || {};
        const metadata = attrs?.metadata || {};
        const subscriptionId = metadata?.subscription_id || metadata?.paymongo_subscription_id || null;

        if (!subscriptionId) {
            logger.warn('PayMongo payment event missing subscription_id metadata', { paymentId });
            return;
        }

        const tenant = await paymentRepository.findTenantBySubscriptionId(subscriptionId);
        if (!tenant) {
            logger.warn(`PayMongo payment for unknown subscription: ${subscriptionId}`);
            return;
        }

        const amount = Number(attrs?.amount || 0) / 100;
        const currency = attrs?.currency || 'PHP';

        await paymentRepository.runInTransaction(async (transaction) => {
            try {
                await paymentRepository.createPayment({
                    tenant_id: tenant.id,
                    transaction_id: paymentId,
                    amount,
                    currency,
                    status: 'completed',
                    payment_method: 'paymongo',
                    metadata: resource
                }, { transaction });
            } catch (error) {
                if (error?.name === 'SequelizeUniqueConstraintError') {
                    logger.info(`Duplicate PayMongo payment transaction ${paymentId} detected.`);
                    return;
                }
                throw error;
            }

            const now = new Date();
            const anchor = tenant.billing_cycle_anchor || now.getDate();
            const nextBillingDate = extendOneCalendarMonth(now, anchor);

            tenant.subscription_status = 'active';
            tenant.current_period_end = nextBillingDate;
            tenant.payment_method = 'paymongo';
            await tenant.save({ transaction });
        });
    }

    const resolvePayMongoSubscriptionId = (resource) => {
        const payload = resource?.attributes?.data || resource || {};
        const attrs = payload?.attributes || {};

        return (
            payload?.id
            || attrs?.subscription_id
            || attrs?.subscription?.id
            || attrs?.metadata?.subscription_id
            || attrs?.metadata?.paymongo_subscription_id
            || attrs?.subscription?.data?.id
            || payload?.relationships?.subscription?.data?.id
            || null
        );
    };

    async function updatePayMongoSubscriptionState(resource, nextState) {
        const subscriptionId = resolvePayMongoSubscriptionId(resource);
        if (!subscriptionId) {
            logger.warn('PayMongo event missing subscription reference', { nextState });
            return;
        }

        const tenant = await paymentRepository.findTenantBySubscriptionId(subscriptionId)
            || await paymentRepository.findTenantByPendingSubscriptionId(subscriptionId);

        if (!tenant) {
            logger.warn(`PayMongo event for unknown subscription: ${subscriptionId}`);
            return;
        }

        const updates = {};
        if (nextState === 'active') {
            updates.subscription_status = 'active';
            updates.payment_method = 'paymongo';
        }
        if (nextState === 'past_due') {
            updates.subscription_status = 'past_due';
            updates.payment_method = 'paymongo';
        }
        if (nextState === 'cancelled') {
            updates.subscription_status = 'cancelled';
            updates.cancelled_at = new Date();
            updates.paymongo_subscription_id = null;
            updates.payment_method = 'manual';
        }

        await tenant.update(updates);
    }

    async function handlePayMongoSubscriptionCreated(resource) {
        const payload = resource?.attributes?.data || resource || {};
        const subscriptionId = resolvePayMongoSubscriptionId(payload);
        if (!subscriptionId) return;

        let tenant = await paymentRepository.findTenantByPendingSubscriptionId(subscriptionId);
        if (!tenant) {
            tenant = await paymentRepository.findTenantBySubscriptionId(subscriptionId);
        }
        if (!tenant) {
            logger.warn(`PayMongo subscription created for unknown tenant: ${subscriptionId}`);
            return;
        }

        await tenant.update({
            paymongo_subscription_id: subscriptionId,
            payment_method: 'paymongo',
            subscription_status: 'active',
            pending_paymongo_subscription_id: null,
            paymongo_setup_initiated_at: null
        });
    }

    async function handlePayMongoSubscriptionUpdated(resource) {
        const payload = resource?.attributes?.data || resource || {};
        const subscriptionId = resolvePayMongoSubscriptionId(payload);
        if (!subscriptionId) return;

        const tenant = await paymentRepository.findTenantBySubscriptionId(subscriptionId)
            || await paymentRepository.findTenantByPendingSubscriptionId(subscriptionId);
        if (!tenant) {
            logger.warn(`PayMongo subscription updated for unknown tenant: ${subscriptionId}`);
            return;
        }

        const paymongoStatus = payload?.attributes?.status;
        if (paymongoStatus === 'active') {
            await tenant.update({ subscription_status: 'active' });
        } else if (paymongoStatus === 'past_due' || paymongoStatus === 'incomplete' || paymongoStatus === 'unpaid') {
            await tenant.update({ subscription_status: 'past_due' });
        }
    }

    async function handlePayMongoSubscriptionCancelled(resource) {
        const payload = resource?.attributes?.data || resource || {};
        const subscriptionId = resolvePayMongoSubscriptionId(payload);
        if (!subscriptionId) return;

        const tenant = await paymentRepository.findTenantBySubscriptionId(subscriptionId);
        if (!tenant) {
            logger.warn(`PayMongo subscription cancelled for unknown tenant: ${subscriptionId}`);
            return;
        }

        await tenant.update({
            subscription_status: 'cancelled',
            cancelled_at: new Date(),
            paymongo_subscription_id: null,
            payment_method: 'manual'
        });
    }

    return async ({ body, headers, rawBody, bypassSignature = false }) => {
        const eventType = body?.event_type || body?.type;
        const resource = body?.resource || body?.data || {};
        const paypalEventId = body?.id || null;
        const paypalEventTime = body?.create_time || body?.event_time || null;
        const transmissionId = headers?.['paypal-transmission-id'] || null;
        const paymongoSignature = headers?.['paymongo-signature'] || headers?.['x-paymongo-signature'] || null;
        const webhookId = buildWebhookDedupKey(body, headers);
        const shouldBypassSignature = bypassSignature && process.env.NODE_ENV !== 'production';

        if (!webhookId) {
            logger.error('Webhook rejected: missing both event id and transmission id', { eventType });
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Missing webhook id',
                { statusCode: 400, details: { responseFormat: 'text' } }
            ));
        }

        logger.info(`Received webhook: ${eventType}`, {
            webhookId,
            transmissionId,
            resourceId: resource?.id
        });

        if (!shouldBypassSignature) {
            const isPayMongoEvent = eventType?.startsWith('subscription.') || eventType?.startsWith('payment.');
            const isValid = isPayMongoEvent
                ? paymongoService?.verifyWebhookSignature?.(paymongoSignature, rawBody || body) || false
                : (paypalService?.verifyWebhookSignature
                    ? await paypalService.verifyWebhookSignature(headers, body)
                    : false);

            if (!isValid) {
                logger.error(`Invalid webhook signature for ID: ${webhookId}`);
                await emitWebhookEvent('paypal_webhook_invalid_signature', {
                    requestId: transmissionId || webhookId,
                    correlationId: webhookId,
                    providerEventId: paypalEventId,
                    providerEventTime: paypalEventTime,
                    outcome: 'blocked',
                    failureCode: 'invalid_signature',
                    failureReason: 'webhook_signature_verification_failed',
                    httpStatus: 401,
                    metadata: {
                        event_type: eventType,
                        transmission_id: transmissionId,
                        is_paymongo_event: isPayMongoEvent
                    }
                });
                return fail(new DomainError(
                    DomainErrorCode.AUTHENTICATION_FAILED,
                    'Invalid Signature',
                    { statusCode: 401, details: { responseFormat: 'text' } }
                ));
            }
        } else {
            logger.warn(`Bypassing webhook signature verification for simulated event ${webhookId}.`);
        }

        const existingLog = await paymentRepository.findWebhookLog(webhookId);
        if (existingLog && existingLog.status === 'processed') {
            logger.info(`Webhook ${webhookId} already processed. Skipping.`);
            await emitWebhookEvent('paypal_webhook_replayed', {
                requestId: transmissionId || webhookId,
                correlationId: webhookId,
                providerEventId: paypalEventId,
                providerEventTime: paypalEventTime,
                outcome: 'ignored',
                failureCode: 'duplicate_webhook',
                metadata: {
                    paypal_event_type: eventType,
                    transmission_id: transmissionId,
                    resource_id: resource?.id || null
                }
            });
            return ok({ format: 'text', body: 'OK' });
        }

        const [log] = await paymentRepository.findOrCreateWebhookLog(webhookId, {
            event_type: eventType,
            resource_id: resource?.id,
            status: 'pending'
        });

        try {
            switch (eventType) {
                case 'PAYMENT.SALE.COMPLETED':
                    await handlePaymentCompleted(resource);
                    break;
                case 'BILLING.SUBSCRIPTION.CANCELLED':
                case 'BILLING.SUBSCRIPTION.SUSPENDED':
                case 'BILLING.SUBSCRIPTION.EXPIRED':
                    await handleSubscriptionCancelled(resource);
                    break;
                case 'BILLING.SUBSCRIPTION.ACTIVATED':
                    await handleSubscriptionActivated(resource);
                    break;
                case 'BILLING.SUBSCRIPTION.CREATED':
                    logger.info(`Webhook received for subscription creation: ${resource?.id || 'unknown-subscription-id'}`);
                    break;
                case 'BILLING.SUBSCRIPTION.UPDATED':
                    await handleSubscriptionUpdated(resource);
                    break;
                case 'payment.paid':
                    await handlePayMongoPaymentPaid(resource);
                    break;
                case 'payment.failed':
                    await updatePayMongoSubscriptionState(resource, 'past_due');
                    break;
                case 'subscription.created':
                    await handlePayMongoSubscriptionCreated(resource);
                    break;
                case 'subscription.updated':
                    await handlePayMongoSubscriptionUpdated(resource);
                    break;
                case 'subscription.past_due':
                case 'subscription.unpaid':
                case 'subscription.invoice.payment_failed':
                    await updatePayMongoSubscriptionState(resource, 'past_due');
                    break;
                case 'subscription.invoice.paid':
                    await updatePayMongoSubscriptionState(resource, 'active');
                    break;
                case 'subscription.cancelled':
                    await handlePayMongoSubscriptionCancelled(resource);
                    break;
                default:
                    logger.info(`Unhandled Webhook Event: ${eventType}`);
            }

            await log.update({
                status: 'processed',
                processed_at: new Date()
            });
        } catch (procError) {
            logger.error(`Error processing webhook contents: ${procError.message}`);
            await log.update({
                status: 'failed',
                error_message: procError.message
            });
            await emitWebhookEvent('paypal_webhook_failed', {
                requestId: transmissionId || webhookId,
                correlationId: webhookId,
                subscriptionId: resource?.billing_agreement_id || resource?.id || null,
                providerEventId: paypalEventId,
                providerEventTime: paypalEventTime,
                outcome: 'failed',
                failureCode: 'processing_failed',
                failureReason: procError.message,
                httpStatus: 500,
                metadata: {
                    paypal_event_type: eventType,
                    transmission_id: transmissionId,
                    resource_id: resource?.id || null
                }
            });
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                'Failed to process webhook',
                { statusCode: 500, details: { responseFormat: 'text' } }
            ));
        }

        return ok({ format: 'text', body: 'OK' });
    };
};
