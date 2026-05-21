# SKUpervisor — Subscription Management Implementation Plan

**Version:** 1.0
**Date:** March 9, 2026
**Prepared by:** Manus AI
**System:** SKUpervisor (SKU Inventory Manager)

---

## 1. Executive Summary

This document defines the implementation plan for extending SKUpervisor's subscription and billing management system. The current system supports two subscription tiers — Standard (₱2,000/month) and Premium (₱3,000/month) — but relies on divergent registration paths: Standard users submit a manual registration request for admin approval, while Premium users pay through PayPal and are auto-activated. This plan unifies and extends those flows so that both tiers offer PayPal recurring billing alongside manual registration, introduces self-service plan changes for PayPal subscribers, enables admin-initiated PayPal setup on behalf of users, and establishes a robust cancellation-and-reactivation lifecycle. Every recommendation in this document is aligned with the existing tech stack (React 18 + Vite frontend, Node.js + Express + Sequelize + MySQL backend, PayPal Subscriptions API v1) and the multi-tenant architecture already in place.

---

## 2. Current System Overview

Before detailing the changes, it is important to establish a shared understanding of how the system works today. This section describes the existing architecture so that every stakeholder — developer, admin, and project owner — can confirm the baseline before implementation begins.

### 2.1 Architecture at a Glance

| Layer | Technology | Key Details |
|-------|-----------|-------------|
| Frontend | React 18.2 + Vite 5 + TailwindCSS + Shadcn (Radix UI) | State via Zustand; PayPal via `@paypal/react-paypal-js` 8.9.2 |
| Backend | Node.js (ESM) + Express 4.18 | Sequelize 6.35 ORM; MySQL2 driver; Nodemailer for email |
| Database | MySQL 8.0, multi-tenant | One shared **landlord DB** (Tenants, Payments, WebhookLogs) + one isolated DB per company tenant |
| PayPal | Subscriptions API v1 | Custom axios-based service (`paypalService.js`); webhook listener at `POST /api/v1/payments/webhook` |
| Scheduling | node-cron | Daily billing scheduler at 00:00 UTC for expiry warnings and grace-period enforcement |

### 2.2 Current Registration Flows

**Standard Plan (₱2,000/month) — Manual Only:**
The registrant submits their company name, admin email, admin password, and selects the Standard plan. The system creates a Tenant record with `status = 'pending'` and `subscription_status = 'inactive'`. No database is provisioned. The admin reviews the request and, after confirming that the registrant has paid ₱2,000 directly (cash or equivalent outside-of-PayPal arrangement), manually approves the tenant via `POST /api/v1/admin/tenants/:id/approve`. Upon approval, the tenant database is provisioned and the account becomes active. There is no PayPal integration for this path.

**Premium Plan (₱3,000/month) — PayPal Only:**
The registrant completes the same form but selects Premium. The frontend renders a PayPal subscription button. The registrant authorizes a recurring ₱3,000/month payment through PayPal, which returns a `subscriptionId`. The backend verifies this subscription with PayPal, and if the status is `ACTIVE`, the tenant is immediately approved, the database is provisioned, and `current_period_end` is set from PayPal's `next_billing_time`. No admin intervention is required.

### 2.3 Current Subscription Data Model

Subscription data resides directly on the **Tenant** record in the landlord database. There is no separate subscriptions table. The relevant fields are:

| Field | Type | Purpose |
|-------|------|---------|
| `plan` | ENUM (`standard`, `premium`) | Current plan tier |
| `subscription_status` | ENUM (`active`, `inactive`, `past_due`, `cancelled`, `pending`) | Subscription health |
| `paypal_subscription_id` | STRING, nullable | PayPal-assigned subscription ID |
| `current_period_end` | DATE, nullable | Expiry or next-renewal date |
| `billing_cycle_anchor` | INTEGER (1–31), nullable | Day-of-month for billing |
| `grace_period_end` | DATE, nullable | 3-day grace window after payment failure |
| `cancelled_at` | DATE, nullable | Timestamp of cancellation |

A separate **Payments** table logs individual transactions (`tenant_id`, `transaction_id`, `amount`, `currency`, `status`, `payment_method`, `payment_date`, `metadata`). A **WebhookLogs** table provides idempotency for PayPal webhook events.

### 2.4 Current Gaps and Limitations

The following table summarizes every gap that this implementation plan addresses:

| # | Gap | Impact |
|---|-----|--------|
| G1 | Standard plan has no PayPal recurring billing option | Standard users cannot self-manage billing; admin must manually track renewals |
| G2 | Premium plan has no "Submit Registration Request" option | Users who want Premium but prefer to pay manually have no path |
| G3 | No user-facing plan change UI exists post-registration | Users cannot upgrade or downgrade on their own |
| G4 | No plan-change queuing system | No mechanism to schedule a plan change for the next billing cycle |
| G5 | No admin-initiated PayPal setup for users | Admin cannot generate a PayPal approval link to send to a manually-approved user |
| G6 | `authenticate()` middleware does not check subscription status | Inactive or expired users can still access the app if their JWT is valid |
| G7 | `requirePremium()` does not check `subscription_status` or `current_period_end` | Users in grace period retain full premium access until the daily cron downgrades them |
| G8 | Rejected users cannot re-submit registration | Once rejected, the user is permanently locked out without direct admin database intervention |
| G9 | No cancellation-to-reactivation flow | Cancelled users have no self-service path to request reactivation |
| G10 | No mechanism for users to migrate from manual billing to PayPal recurring | Manually-approved users are stuck on manual renewals indefinitely |

---

## 3. Registration Flow — Redesigned

The redesigned registration page presents both plan tiers with two action paths each, giving every registrant the choice between PayPal recurring billing and manual registration regardless of which plan they select.

### 3.1 Registration Page Layout

When a user visits the registration page, they will see two plan cards side by side:

| Element | Standard Card | Premium Card |
|---------|--------------|--------------|
| Plan Name | Standard | Premium |
| Price | ₱2,000 / month | ₱3,000 / month |
| Features | (existing feature list) | (existing feature list) |
| Action 1 | **PayPal Subscribe Button** — Sets up ₱2,000/month recurring billing | **PayPal Subscribe Button** — Sets up ₱3,000/month recurring billing |
| Action 2 | **"Submit Registration Request" Button** — Manual approval path | **"Submit Registration Request" Button** — Manual approval path |

### 3.2 PayPal Path (Either Plan)

This flow applies identically to both Standard and Premium when the user clicks the PayPal button.

**Step-by-step flow:**

1. The user fills in company name, admin email, and admin password, then selects a plan card and clicks the PayPal button.
2. The PayPal JS SDK renders the subscription approval experience. The `plan_id` passed to the SDK corresponds to the selected tier (Standard Plan ID or Premium Plan ID — see Section 8.1 for setup).
3. The user logs into PayPal and authorizes the recurring payment.
4. PayPal returns a `subscriptionId` to the frontend's `onApprove` callback.
5. The frontend sends the registration payload (company name, email, password, plan, `subscriptionId`) to `POST /api/v1/tenants/register`.
6. The backend calls `paypalService.verifySubscription(subscriptionId)` to confirm the subscription status is `ACTIVE`.
7. If verified: the Tenant record is created with `status = 'active'`, `subscription_status = 'active'`, the appropriate `plan` value, `paypal_subscription_id`, `current_period_end` (from PayPal's `billing_info.next_billing_time`), and `billing_cycle_anchor` (extracted day-of-month). The tenant database is provisioned immediately.
8. The user receives a welcome email and can log in immediately.

**What changes from today:** The existing Premium PayPal flow is generalized. The `registerCompanyRequestUseCase.js` must accept a `subscriptionId` for Standard plan registrations as well, not only for Premium. The frontend must pass the correct `plan_id` environment variable depending on which card the user selected.

### 3.3 Manual Path — "Submit Registration Request" (Either Plan)

This flow applies identically to both Standard and Premium when the user clicks "Submit Registration Request."

**Step-by-step flow:**

1. The user fills in company name, admin email, admin password, and selects a plan card, then clicks "Submit Registration Request."
2. The frontend sends the registration payload (company name, email, password, plan) to `POST /api/v1/tenants/register` **without** a `subscriptionId`.
3. The backend creates a Tenant record with `status = 'pending'`, `subscription_status = 'inactive'`, and the selected `plan` value. No database is provisioned.
4. The user sees a confirmation message: *"Your registration request for the [Standard/Premium] plan has been submitted for review."*
5. The admin receives notification of the pending request (via the admin dashboard).
6. The admin verifies that the registrant has paid ₱2,000 (Standard) or ₱3,000 (Premium) through a direct cash or outside-of-PayPal arrangement.
7. The admin approves the tenant via the admin panel. Upon approval: `status` is set to `active`, `subscription_status` is set to `active`, `current_period_end` is set to 30 days from the approval date, the tenant database is provisioned, and the user receives an approval email.
8. If the admin rejects the request, the `status` is set to `rejected`, a `rejection_reason` is stored, and the user receives a rejection email.

**What changes from today:** The manual path is extended to Premium registrations. Currently, only Standard uses this path. The backend must no longer require `subscriptionId` as mandatory for Premium — it should be optional for both plans.

### 3.4 Re-submission for Rejected Users

Currently, rejected users have no path to re-submit. This must be addressed.

**Implementation:** When a user whose tenant status is `rejected` attempts to log in, the system should display a message: *"Your registration was previously declined. Reason: [rejection_reason]. You may submit a new registration request."* The interface should present a button that allows the user to re-submit their registration. On the backend, a new endpoint or modification to the existing registration endpoint should allow re-submission by resetting the tenant's `status` from `rejected` back to `pending`, clearing the `rejection_reason`, and optionally allowing the user to select a different plan. The admin then reviews the new request through the same approval flow.

**Backend change:** Add a `PUT /api/v1/tenants/:id/resubmit` endpoint (or modify the existing registration flow to detect an existing rejected tenant by email and reset it). The `rejectTenantUseCase.js` logic should be updated to support a `pending` transition from `rejected`.

---

## 4. Migration from Manual Billing to PayPal Recurring

Users who were approved through the manual path (no PayPal subscription) should be able to migrate to PayPal recurring billing at any time during their active period. This gives them the benefits of automated renewals and self-service plan management.

### 4.1 User-Initiated Migration

**Where it appears:** A new section in the user's account/billing settings page (accessible to the company's master admin). If the tenant has `subscription_status = 'active'` but `paypal_subscription_id = NULL`, the system displays a prompt: *"You are currently on a manually-managed billing cycle. Set up PayPal recurring payments to automate your renewals."* Below this prompt, a PayPal subscription button is rendered for the user's current plan.

**Step-by-step flow:**

1. The user clicks the PayPal button on their billing settings page.
2. The PayPal JS SDK presents the subscription approval experience using the Plan ID that matches the user's current plan (Standard or Premium).
3. The user authorizes the recurring payment on PayPal.
4. The frontend receives the `subscriptionId` and sends it to `POST /api/v1/payments/migrate-to-paypal`.
5. The backend verifies the subscription with PayPal, then updates the Tenant record: sets `paypal_subscription_id`, updates `current_period_end` from PayPal's `billing_info.next_billing_time`, and sets `billing_cycle_anchor`.
6. From this point forward, PayPal handles all renewals automatically. The remaining days from the manual approval period are effectively absorbed — the user's next PayPal charge will occur on the date PayPal determines based on when they subscribed.

**Important consideration:** The user does not receive a refund or credit for unused days on their manual period. By migrating to PayPal, they are choosing to start a new PayPal billing cycle immediately. PayPal will charge them on the subscription start date and then monthly thereafter. The user should be clearly informed of this before they proceed: *"By setting up PayPal recurring payments, your next billing date will be [date from PayPal]. Any remaining days on your current manual billing period will not be refunded."*

### 4.2 Admin-Initiated PayPal Setup

There are scenarios where the admin and user agree (outside the app) that the user should transition to PayPal recurring billing, and the admin wants to initiate this process. Since PayPal requires the actual account holder to authorize recurring payments for security reasons, the admin cannot complete this on the user's behalf. However, the admin **can** generate a PayPal approval link and send it to the user.

**How this works technically:** The PayPal Subscriptions API supports server-side subscription creation via `POST /v1/billing/subscriptions`. When called from the backend, this endpoint creates a subscription with status `APPROVAL_PENDING` and returns HATEOAS links in the response, including an `approve` link (e.g., `https://www.paypal.com/webapps/billing/subscriptions?ba_token=BA-XXXXX`). This link can be sent to the user via email. When the user clicks it, they are taken to PayPal to log in and authorize the recurring payment. Once authorized, PayPal fires the `BILLING.SUBSCRIPTION.ACTIVATED` webhook, which the existing webhook handler processes. [1]

**Step-by-step flow:**

1. The admin navigates to the tenant's detail page in the admin panel and clicks "Setup PayPal Recurring for This User."
2. The admin selects the plan tier (Standard or Premium) — this defaults to the user's current plan but can be changed if both parties agreed on a plan switch.
3. The backend calls `POST /v1/billing/subscriptions` with the following payload:
   - `plan_id`: The PayPal Plan ID for the selected tier.
   - `subscriber.email_address`: The tenant's admin email.
   - `subscriber.name.given_name` and `surname`: The tenant admin's name.
   - `application_context.brand_name`: "SKUpervisor".
   - `application_context.user_action`: "SUBSCRIBE_NOW".
   - `application_context.return_url`: A SKUpervisor URL that confirms successful setup (e.g., `https://app.skupervisor.com/billing/paypal-setup-success`).
   - `application_context.cancel_url`: A SKUpervisor URL for cancellation (e.g., `https://app.skupervisor.com/billing/paypal-setup-cancelled`).
4. The backend extracts the `approve` URL from the response's `links` array (where `rel = "approve"`).
5. The backend stores the PayPal subscription ID (still in `APPROVAL_PENDING` state) temporarily on the Tenant record in a new field `pending_paypal_subscription_id`, along with a timestamp `paypal_setup_initiated_at`.
6. The backend sends an email to the user containing the approve link, with a message such as: *"Your SKUpervisor admin has set up PayPal recurring billing for your [Standard/Premium] plan at ₱[amount]/month. Click the link below to authorize this payment on PayPal. This link expires in 72 hours."*
7. The user clicks the link, logs into PayPal, and approves the subscription.
8. PayPal fires the `BILLING.SUBSCRIPTION.ACTIVATED` webhook. The webhook handler matches the subscription ID to the tenant (via `pending_paypal_subscription_id`), moves it to `paypal_subscription_id`, sets `subscription_status = 'active'`, populates `current_period_end` and `billing_cycle_anchor`, and clears the pending fields.
9. If the user does not approve within 72 hours, a scheduled cleanup job clears the `pending_paypal_subscription_id` and the admin is notified that the setup expired.

**New backend endpoint:** `POST /api/v1/admin/tenants/:id/setup-paypal-recurring`

**New email template:** `sendPayPalSetupEmail()` in `emailService.js`

---

## 5. Plan Changes — User-Initiated

Users who have an active PayPal subscription can change their plan (upgrade or downgrade) through a self-service interface. Users on manual billing cannot change plans on their own and must contact the admin. This distinction exists because PayPal's Revise Subscription API handles the billing transition automatically, whereas manual billing has no automated mechanism for plan changes.

### 5.1 Eligibility Rules

| User's Current State | Can Self-Service Change Plan? | Reason |
|----------------------|------------------------------|--------|
| Active PayPal subscription | **Yes** | PayPal Revise API handles billing transition |
| Manually-approved (no PayPal) | **No** — must contact admin | No automated billing mechanism to transition |
| Pending registration | **No** | Account not yet active |
| Inactive / Cancelled | **No** | Must reactivate first (see Section 7) |
| Already has a queued plan change | **No** | Must wait for current queued change to take effect |

### 5.2 User-Initiated Plan Change Flow (PayPal Subscribers)

**Where it appears:** The billing settings page displays the user's current plan and a "Change Plan" button. Clicking it shows the alternative plan with its price and a confirmation prompt.

**Step-by-step flow:**

1. The user navigates to billing settings and clicks "Change Plan."
2. The system displays the alternative plan (if currently Standard, show Premium at ₱3,000/month; if currently Premium, show Standard at ₱2,000/month) with a clear explanation: *"Your plan change will take effect at the end of your current billing cycle on [current_period_end]. You will continue to use your current [plan] plan until then."*
3. The user confirms the change.
4. The frontend sends a request to `POST /api/v1/payments/change-plan` with the desired `new_plan` value.
5. The backend calls PayPal's Revise Subscription API: `POST /v1/billing/subscriptions/{subscription_id}/revise` with `{"plan_id": "NEW_PLAN_ID"}`. [2]
6. PayPal returns a response that includes an `approve` HATEOAS link. **The user must re-consent to the revised subscription on PayPal.** This is a PayPal security requirement for subscriptions funded by PayPal balance or linked bank accounts. [2]
7. The backend stores the pending change locally: sets `pending_plan` to the new plan value and `pending_plan_change_date` to the current timestamp on the Tenant record.
8. The user is redirected to PayPal's approve URL (or shown the link) to re-consent.
9. Once the user approves on PayPal, the revision is confirmed. PayPal will automatically apply the new pricing on the **next billing cycle**. The backend updates `pending_plan_approved = true`.
10. On the next billing cycle, when PayPal charges the new amount and fires the `PAYMENT.SALE.COMPLETED` webhook, the webhook handler detects that `pending_plan` is set, updates `plan` to the new value, and clears the pending fields.

**Important behavioral rules:**

- The user **cannot cancel a queued plan change** once it has been approved on PayPal. They must wait for the change to take effect before making another change.
- The user **can still cancel their subscription entirely** even if a plan change is queued. Cancellation takes priority and overrides the queued change (see Section 6).
- If the user does not complete the PayPal re-consent step, the revision does not take effect and the subscription continues on the current plan. The `pending_plan` fields should be cleared after 72 hours if re-consent was not completed.

### 5.3 What Happens at the Billing Cycle Boundary

PayPal's Revise Subscription API natively handles the timing of plan changes. According to PayPal's documentation, the new price is effective starting on the next billing cycle, with no automatic proration. [2] For example:

> A subscriber's billing cycle is at the beginning of the month. They upgrade their plan mid-cycle. PayPal charges the subscriber the new price on the next billing cycle onwards.

This means the system does not need to implement its own queuing logic for PayPal-managed plan changes — PayPal handles it. The `pending_plan` field in the local database serves only as a **display indicator** so the UI can show the user that a change is pending.

---

## 6. Plan Changes — Admin-Initiated

Admins retain the ability to change a tenant's plan through the admin panel. There are two distinct scenarios depending on whether the tenant has a PayPal subscription.

### 6.1 Admin Changing Plan for a PayPal Subscriber

When the tenant has an active PayPal subscription, the admin-initiated plan change must go through PayPal's Revise API to keep the billing aligned.

**Step-by-step flow:**

1. The admin navigates to the tenant's detail page and selects "Change Plan."
2. The admin selects the target plan (Standard or Premium).
3. The backend calls `POST /v1/billing/subscriptions/{subscription_id}/revise` with the new Plan ID.
4. The backend stores `pending_plan` on the Tenant record.
5. The system sends an email to the tenant's admin with the PayPal approve link: *"Your SKUpervisor administrator has initiated a plan change to [new plan] at ₱[amount]/month. Please click the link below to approve this change on PayPal. The new pricing will take effect on your next billing cycle."*
6. The user clicks the link, re-consents on PayPal, and the revision is confirmed.
7. The webhook handler processes the plan change on the next billing cycle, as described in Section 5.2.

If the user does not approve the revision within 72 hours, the pending change is cleared and the admin is notified.

### 6.2 Admin Changing Plan for a Manually-Approved Tenant

When the tenant has no PayPal subscription (manually approved), the admin can change the plan directly.

**Step-by-step flow:**

1. The admin navigates to the tenant's detail page and selects "Change Plan."
2. The admin selects the target plan and confirms.
3. The backend updates the `plan` field on the Tenant record. Since there is no PayPal subscription to revise, the change can take effect based on the admin's discretion:
   - **Immediate:** The plan changes right away. The admin should ensure the user has paid the correct amount for the new plan.
   - **Deferred:** The admin sets a `pending_plan` and `pending_plan_effective_date` (e.g., the current `current_period_end`). The daily cron job checks for tenants where `pending_plan_effective_date <= NOW` and applies the change.
4. The user is notified via email of the plan change.

### 6.3 Admin Force-Override

The existing `PUT /api/v1/admin/tenants/:id` endpoint already allows the admin to directly set the `plan` field. This capability is preserved as a force-override for exceptional situations (e.g., correcting a billing error, honoring a special agreement). When using force-override, the admin accepts responsibility for ensuring that PayPal billing (if applicable) is manually reconciled.

---

## 7. Cancellation and Reactivation

### 7.1 Cancellation Flow

Cancellation means the user is ending their subscription and, after their remaining billing period expires, will lose access to the application.

**For PayPal subscribers:**

1. The user navigates to billing settings and clicks "Cancel Subscription."
2. The system displays a confirmation: *"Your subscription will remain active until [current_period_end]. After that date, your account will become inactive and you will no longer be able to access SKUpervisor. Your data will be preserved."*
3. The user confirms.
4. The backend calls PayPal's Cancel Subscription API: `POST /v1/billing/subscriptions/{subscription_id}/cancel` with a reason note. [1]
5. The backend sets `cancelled_at = NOW` and `subscription_status = 'cancelled'` on the Tenant record.
6. The user retains full access until `current_period_end`.
7. After `current_period_end` passes, the daily cron job sets `subscription_status = 'inactive'`. The auth middleware (once updated — see Section 9) blocks further access.
8. If a plan change was queued (`pending_plan` is set), the cancellation overrides it. The pending fields are cleared, since the subscription is ending entirely.

**For manually-approved users:**

1. The user contacts the admin to request cancellation (or the admin initiates it).
2. The admin sets `subscription_status = 'cancelled'` and `cancelled_at = NOW` via the admin panel.
3. The user retains access until `current_period_end`.
4. After expiry, the daily cron sets `subscription_status = 'inactive'`.

### 7.2 Reactivation Flow

A previously cancelled or inactive user who wants to return to SKUpervisor must go through a reactivation process. Their company data is preserved (the tenant database still exists), so reactivation restores access to their existing data rather than starting fresh.

**Step-by-step flow:**

1. The inactive user attempts to log in.
2. The system detects that the tenant's `subscription_status` is `inactive` (and `status` is not `rejected` or `deleted`).
3. The login page displays a message: *"Your account is currently inactive. To reactivate your account, please submit a reactivation request or contact your SKUpervisor administrator at [admin email]."*
4. The user is presented with two options:
   - **"Request Reactivation via Email"** — The system sends an email to the SKUpervisor platform admin notifying them that the user wants to reactivate. The admin then processes this as a new approval (manual path).
   - **"Reactivate with PayPal"** — The system presents the plan selection (Standard or Premium) with PayPal buttons. The user can choose **any plan**, regardless of what they had before. If they complete the PayPal subscription, the backend reactivates the tenant: sets `status = 'active'`, `subscription_status = 'active'`, updates `paypal_subscription_id`, `current_period_end`, and `billing_cycle_anchor`. No admin approval is needed since PayPal payment is verified automatically.
5. For the manual reactivation path: the admin reviews the request, confirms payment, and approves the reactivation via the admin panel. The system resets `subscription_status = 'active'`, sets a new `current_period_end` (30 days from approval), and clears `cancelled_at`.

**Key distinction from new registration:** Reactivation does **not** re-provision the tenant database — it already exists. The system only updates the subscription fields on the existing Tenant record.

**Data retention policy:** Inactive tenants retain their data indefinitely. However, if an admin **deletes** a tenant or if the tenant was **rejected** (and never approved), the data is lost permanently and cannot be recovered.

---

## 8. PayPal Configuration Changes

### 8.1 Create a Standard Plan in PayPal

The current system has only one PayPal Plan ID configured (for Premium). A new PayPal Billing Plan must be created for the Standard tier.

**Steps to create the Standard plan:**

1. Ensure a PayPal Product exists (or create one via `POST /v1/catalogs/products`). Both plans must belong to the **same Product** — this is a PayPal requirement for the Revise Subscription API to work across plans. [2]
2. Create the Standard Billing Plan via `POST /v1/billing/plans` with the following configuration:

| Parameter | Value |
|-----------|-------|
| `product_id` | The shared Product ID (same as Premium) |
| `name` | "SKUpervisor Standard Plan" |
| `description` | "Standard monthly subscription for SKUpervisor" |
| `status` | "ACTIVE" |
| `billing_cycles[0].frequency.interval_unit` | "MONTH" |
| `billing_cycles[0].frequency.interval_count` | 1 |
| `billing_cycles[0].tenure_type` | "REGULAR" |
| `billing_cycles[0].sequence` | 1 |
| `billing_cycles[0].total_cycles` | 0 (infinite) |
| `billing_cycles[0].pricing_scheme.fixed_price.value` | "2000" |
| `billing_cycles[0].pricing_scheme.fixed_price.currency_code` | "PHP" |
| `payment_preferences.auto_bill_outstanding` | true |
| `payment_preferences.payment_failure_threshold` | 3 |

3. Store the returned Plan ID in the environment configuration:
   - `VITE_PAYPAL_STANDARD_PLAN_ID` (frontend)
   - `PAYPAL_STANDARD_PLAN_ID` (backend)
4. Rename the existing Premium Plan ID variable for clarity:
   - `VITE_PAYPAL_PREMIUM_PLAN_ID` (frontend, currently `VITE_PAYPAL_PLAN_ID`)
   - `PAYPAL_PREMIUM_PLAN_ID` (backend)

### 8.2 Verify Shared Product ID

Both the Standard and Premium plans **must** be created under the same PayPal Product. If the existing Premium plan was created under a specific Product ID, the Standard plan must use that same Product ID. If the Product ID is unknown, retrieve it by calling `GET /v1/billing/plans/{premium_plan_id}` and reading the `product_id` field from the response. If the plans end up under different Products, the Revise Subscription API will reject plan-change requests with an error.

### 8.3 Webhook Event Handling Updates

The existing webhook handler processes `PAYMENT.SALE.COMPLETED` and `BILLING.SUBSCRIPTION.ACTIVATED`. The following additional events should be handled:

| Webhook Event | Action |
|--------------|--------|
| `BILLING.SUBSCRIPTION.CANCELLED` | Set `subscription_status = 'cancelled'`, `cancelled_at = NOW` |
| `BILLING.SUBSCRIPTION.SUSPENDED` | Set `subscription_status = 'past_due'`, begin grace period |
| `BILLING.SUBSCRIPTION.UPDATED` | Log the update; if plan revision detected, update `pending_plan_approved` |
| `BILLING.SUBSCRIPTION.EXPIRED` | Set `subscription_status = 'inactive'` |
| `PAYMENT.SALE.COMPLETED` (existing) | **Extend:** If `pending_plan` is set and `pending_plan_approved = true`, apply the plan change (update `plan`, clear pending fields) in addition to extending `current_period_end` |

---

## 9. Authentication and Access Control Fixes

### 9.1 Subscription Status Check in Auth Middleware

The current `authenticate()` middleware in `backend/src/middleware/auth.js` verifies the JWT, checks the token blacklist, and confirms the user exists and is active. It does **not** check the tenant's `subscription_status` or `current_period_end`. This is a critical gap: an inactive or expired tenant's users can still access the application as long as their JWT is valid.

**Required change:** After the existing authentication checks pass, the middleware must load the tenant record (via `UserTenantMapping`) and verify that `subscription_status` is one of `['active', 'past_due']`. If the status is `inactive`, `cancelled` (and `current_period_end` has passed), or `pending`, the middleware should return a `403 Forbidden` response with a message indicating that the subscription is inactive.

**Exception:** Admin-panel routes used by the platform super-admin (if applicable) should bypass this check so the admin can still manage tenants.

### 9.2 Fix `requirePremium()` Middleware

The current `requirePremium()` middleware only checks `req.tenant.plan === 'premium'`. It should additionally verify that `subscription_status` is `active` or `past_due` (within grace period). This prevents a scenario where a tenant's plan field still says `premium` but their subscription has actually lapsed.

### 9.3 Grace Period Behavior

The existing grace period logic (3 days after payment failure) is sound. However, during the grace period, the user should see an in-app banner warning: *"Your payment failed. You have [X] days to resolve this before your account is deactivated. Please contact your administrator or update your PayPal payment method."* This requires a frontend check on the tenant's `subscription_status` field (exposed via the existing auth/session endpoint).

---

## 10. Database Schema Changes

The following fields must be added to the **Tenant** model in the landlord database:

| New Field | Type | Purpose |
|-----------|------|---------|
| `pending_plan` | ENUM (`standard`, `premium`), nullable | The plan the tenant is switching to at the next billing cycle |
| `pending_plan_change_date` | DATE, nullable | When the plan change was requested |
| `pending_plan_approved` | BOOLEAN, default `false` | Whether the user has re-consented on PayPal for the plan revision |
| `pending_paypal_subscription_id` | STRING, nullable | Stores the subscription ID during admin-initiated PayPal setup (before user approval) |
| `paypal_setup_initiated_at` | DATE, nullable | Timestamp of when admin initiated PayPal setup; used for 72-hour expiry |
| `payment_method` | ENUM (`manual`, `paypal`), default `manual` | Tracks whether the tenant pays manually or via PayPal recurring |
| `reactivation_requested_at` | DATE, nullable | Timestamp of when an inactive user requested reactivation |

No new tables are required. The existing Payments and WebhookLogs tables are sufficient.

---

## 11. New API Endpoints

The following new endpoints are required in addition to modifications to existing ones:

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/v1/payments/migrate-to-paypal` | User migrates from manual billing to PayPal recurring | Authenticated user (master admin of tenant) |
| POST | `/api/v1/payments/change-plan` | User initiates a self-service plan change | Authenticated user (master admin of tenant, PayPal subscribers only) |
| POST | `/api/v1/admin/tenants/:id/setup-paypal-recurring` | Admin generates a PayPal approval link for a tenant | Admin only |
| PUT | `/api/v1/tenants/resubmit` | Rejected user re-submits registration request | Public (with email verification) |
| POST | `/api/v1/tenants/request-reactivation` | Inactive user requests reactivation via email | Public (with email verification) |
| GET | `/api/v1/payments/pending-plan` | Returns the user's pending plan change status (if any) | Authenticated user |

Existing endpoints that require modification:

| Endpoint | Change |
|----------|--------|
| `POST /api/v1/tenants/register` | Accept `subscriptionId` as optional for both Standard and Premium plans |
| `POST /api/v1/payments/webhook` | Handle additional webhook events; apply pending plan changes on `PAYMENT.SALE.COMPLETED` |
| `PUT /api/v1/admin/tenants/:id` | Support setting `pending_plan` and `pending_plan_effective_date` for manual tenants |
| `POST /api/v1/admin/tenants/:id/approve` | Set `current_period_end` to 30 days from approval; set `payment_method = 'manual'` |

---

## 12. Email Templates

The following new email templates must be added to `emailService.js`:

| Email | Trigger | Content Summary |
|-------|---------|-----------------|
| PayPal Setup Invitation | Admin initiates PayPal recurring for a user | Contains the PayPal approve link; explains the recurring amount and plan; notes 72-hour expiry |
| PayPal Setup Expired | 72 hours pass without user approval | Notifies admin that the setup link expired; suggests re-initiating |
| Plan Change Pending | User or admin initiates a plan change | Confirms the queued change; states the effective date (next billing cycle) |
| Plan Change Applied | Webhook confirms the new plan is active | Confirms the new plan and new billing amount |
| Reactivation Request | Inactive user requests reactivation | Sent to admin; contains user details and requested plan |
| Reactivation Approved | Admin approves reactivation | Sent to user; confirms account is active again |
| Re-submission Confirmation | Rejected user re-submits registration | Confirms the new request is under review |

---

## 13. Cron Job Updates

The existing daily billing scheduler (`billingScheduler.js`, runs at 00:00 UTC) must be extended with the following tasks:

| Task | Logic |
|------|-------|
| **Apply deferred plan changes (manual tenants)** | For tenants where `pending_plan IS NOT NULL` and `pending_plan_effective_date <= NOW` and `payment_method = 'manual'`: update `plan` to `pending_plan`, clear pending fields, send "Plan Change Applied" email |
| **Expire pending PayPal setups** | For tenants where `pending_paypal_subscription_id IS NOT NULL` and `paypal_setup_initiated_at + 72 hours < NOW`: clear `pending_paypal_subscription_id` and `paypal_setup_initiated_at`, send "PayPal Setup Expired" email to admin |
| **Expire unapproved plan revisions** | For tenants where `pending_plan IS NOT NULL` and `pending_plan_approved = false` and `pending_plan_change_date + 72 hours < NOW`: clear pending fields, notify user that the plan change was not completed |
| **Deactivate cancelled tenants** | (Existing) For tenants where `subscription_status = 'cancelled'` and `current_period_end < NOW`: set `subscription_status = 'inactive'` |
| **Grace period enforcement** | (Existing) For tenants where `subscription_status = 'past_due'` and `grace_period_end < NOW`: set `subscription_status = 'inactive'`, `plan = 'standard'` |

---

## 14. Frontend Changes Summary

| Page / Component | Change |
|-----------------|--------|
| **RegisterCompany.jsx** | Add PayPal button to Standard card; add "Submit Registration Request" button to Premium card; pass correct `plan_id` based on selected card |
| **Login Page** | Detect inactive tenants and show reactivation options; detect rejected tenants and show re-submission option |
| **Billing Settings (new page or section)** | Show current plan, billing method, next billing date, and pending plan change status; "Change Plan" button (PayPal subscribers only); "Migrate to PayPal" button (manual subscribers only); "Cancel Subscription" button |
| **Admin Tenant Detail** | Add "Setup PayPal Recurring" button; add "Change Plan" controls; show pending plan change status; show payment method (manual vs. PayPal) |
| **Admin Tenant List** | Add filter/indicator for payment method and pending changes |
| **Grace Period Banner** | Display warning banner when `subscription_status = 'past_due'` across all pages |

---

## 15. Implementation Sequence

The changes should be implemented in the following order to minimize risk and allow incremental testing:

| Phase | Scope | Dependencies |
|-------|-------|-------------|
| **Phase 1: PayPal Configuration** | Create Standard Billing Plan in PayPal; verify shared Product ID; update environment variables | None |
| **Phase 2: Database Schema** | Add new fields to Tenant model; run migration | None |
| **Phase 3: Registration Flow** | Modify `registerCompanyRequestUseCase.js` to accept optional `subscriptionId` for both plans; update frontend `RegisterCompany.jsx` | Phases 1, 2 |
| **Phase 4: Auth Middleware Fixes** | Add subscription status check to `authenticate()`; fix `requirePremium()`; add grace period banner | Phase 2 |
| **Phase 5: Migration to PayPal** | Build `POST /api/v1/payments/migrate-to-paypal` endpoint; add billing settings UI for manual subscribers | Phases 1, 2, 3 |
| **Phase 6: User-Initiated Plan Changes** | Build `POST /api/v1/payments/change-plan` endpoint; integrate PayPal Revise API; add "Change Plan" UI | Phases 1, 2, 5 |
| **Phase 7: Admin-Initiated PayPal Setup** | Build `POST /api/v1/admin/tenants/:id/setup-paypal-recurring` endpoint; add admin UI; add email template | Phases 1, 2 |
| **Phase 8: Admin Plan Changes** | Extend admin tenant detail page with plan change controls for both PayPal and manual tenants | Phases 2, 6 |
| **Phase 9: Cancellation & Reactivation** | Build cancellation flow; build reactivation request flow; update login page for inactive/rejected users | Phases 2, 4 |
| **Phase 10: Cron Job Updates** | Extend billing scheduler with new tasks (deferred plan changes, expired setups, unapproved revisions) | Phases 2, 6, 7 |
| **Phase 11: Webhook Handler Updates** | Handle additional PayPal events; apply pending plan changes on payment completion | Phases 2, 6 |
| **Phase 12: Re-submission for Rejected Users** | Build re-submission endpoint; update login page | Phase 2 |
| **Phase 13: Testing & QA** | End-to-end testing of all flows in PayPal Sandbox mode; edge case validation | All phases |

---

## 16. Edge Cases and Safeguards

This section documents edge cases that must be handled to ensure the system is robust and free of loopholes.

| Edge Case | Expected Behavior |
|-----------|-------------------|
| User queues a plan change, then cancels subscription | Cancellation takes priority. Clear `pending_plan` fields. User retains access until `current_period_end`, then becomes inactive. |
| User queues a plan change, then tries to queue another | Blocked. The UI should disable the "Change Plan" button and display: *"You already have a pending plan change to [plan]. This will take effect on [date]."* |
| Admin force-changes plan while a user-initiated change is pending | Admin override takes precedence. Clear the user's pending change. Notify the user via email. |
| PayPal webhook arrives but tenant has been deleted | Webhook handler should check if tenant exists. If not, log the event and return 200 (to prevent PayPal retries) without processing. |
| User approves PayPal setup link after admin has already deleted/rejected the tenant | Webhook handler detects tenant status is not valid for activation. Cancel the PayPal subscription via API and log the event. |
| Two admins simultaneously approve the same pending tenant | The approval use case should use a database transaction with a status check (`WHERE status = 'pending'`). If the status has already changed, the second approval fails gracefully. |
| User's PayPal payment fails during a plan change cycle | The plan change does not take effect (PayPal does not charge the new amount). The subscription remains on the old plan. Grace period logic applies to the old plan's billing. |
| Manually-approved user's `current_period_end` passes without renewal | The daily cron sets `subscription_status = 'inactive'`. The user must request reactivation or the admin must manually extend `current_period_end`. |
| User clicks expired PayPal setup link (after 72 hours) | PayPal will show an error or expired page. The system has already cleared the pending setup. No action needed. |
| Reactivating user selects a different plan than before | Allowed. The reactivation flow treats this as a fresh plan selection. The `plan` field is updated to the newly selected plan. |
| User on Standard PayPal tries to downgrade (already on lowest plan) | The "Change Plan" UI should only show the alternative plan. If the user is already on Standard, the only option shown is "Upgrade to Premium." |

---

## 17. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Admin-generated PayPal links could be intercepted | The approve link is a PayPal-hosted URL with a unique `ba_token`. Only the PayPal account holder can authorize the subscription after logging in. Interception does not grant access without PayPal credentials. |
| Webhook spoofing | The existing webhook signature verification (`paypalService.verifyWebhookSignature()`) must remain enabled in production. Ensure `PAYPAL_WEBHOOK_ID` is always set in production. |
| Race conditions on plan changes | Use database transactions for all status transitions. The Sequelize `transaction` option should wrap reads and writes together. |
| Inactive users accessing API via cached JWT | The auth middleware subscription check (Section 9.1) runs on every request, so even cached JWTs will be rejected once the tenant is inactive. |
| Manual payment fraud (user claims to have paid but hasn't) | This is an operational risk, not a technical one. The admin must verify payment before approving. The system should log all approval actions with timestamps and the approving admin's identity for audit purposes. |

---

## 18. Summary of All Flows

The following table provides a quick-reference summary of every subscription lifecycle event and who can trigger it:

| Action | Triggered By | PayPal Involved? | Admin Approval Needed? |
|--------|-------------|-------------------|----------------------|
| Register with PayPal (Standard or Premium) | User | Yes | No (auto-activated) |
| Register with manual payment (Standard or Premium) | User | No | Yes |
| Approve/reject registration | Admin | No | N/A (admin action) |
| Re-submit rejected registration | User | No | Yes (goes back to pending) |
| Migrate manual billing to PayPal | User | Yes | No |
| Admin sets up PayPal for user | Admin (initiates), User (approves on PayPal) | Yes | N/A |
| Change plan (PayPal subscriber) | User | Yes (Revise API + re-consent) | No |
| Change plan (manual subscriber) | Admin | No | N/A (admin action) |
| Admin changes plan for PayPal subscriber | Admin (initiates), User (re-consents) | Yes | N/A |
| Cancel subscription (PayPal) | User | Yes (Cancel API) | No |
| Cancel subscription (manual) | Admin | No | N/A |
| Reactivate with PayPal | User | Yes | No (auto-activated) |
| Reactivate with manual payment | User (requests), Admin (approves) | No | Yes |

---

## References

[1]: PayPal Developer, "Subscriptions API v1," https://developer.paypal.com/docs/api/subscriptions/v1/ — Documentation for creating, managing, and cancelling PayPal subscriptions via REST API, including HATEOAS approval links.

[2]: PayPal Developer, "Upgrade or Downgrade a Subscription," https://developer.paypal.com/docs/subscriptions/customize/revise-subscriptions/ — Official guide on using the Revise Subscription API to change plans, including re-consent requirements and billing cycle behavior.
