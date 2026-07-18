# Phase 4: Backend Accounts, Businesses, and Tenancy Foundation - Discussion Log

**Session Date:** 2026-07-11
**Facilitator:** Claude Code
**Participant:** User (Project Owner)

---

## Areas Selected for Discussion

User selected four implementation areas:
1. Account registration and login flow
2. Session and tenant binding
3. Business owner permissions and scope
4. API endpoint organization

---

## Area 1: Account Registration and Login Flow

### Question 1: Email Verification Strategy
**Options presented:**
- Direct account creation (no verification)
- Email verification required (pending account)
- Optional/configurable verification (created but unverified, warned to verify within window)

**User selection:** Optional/configurable verification

**Rationale:** Balances security against frictionless onboarding. Users can log in immediately but are prompted to complete email verification within a grace window.

---

### Question 2: Password Reset Mechanism
**Options presented:**
- New dedicated forgot-password endpoint
- Use existing token/OTP pattern
- Defer password reset to Phase 5

**User selection:** Use existing token/OTP pattern

**Rationale:** Leverages existing infrastructure from legacy auth. Keeps password recovery mechanism consistent across the platform rather than introducing a new, separate endpoint.

---

### Question 3: Account Profile Fields
**Options presented:**
- Minimal (email/password only)
- Extended (email, password, name, phone)
- Extensible (extended fields + flexible metadata object)

**Initial selection:** Extended (email, password, name, phone)

**Reconsidered during discussion:** User requested to revisit this decision.

**Final selection:** Extensible with custom fields

**Rationale:** Supports current needs (email, password, name, phone for notifications and ownership tracking) while remaining open to future extensions without schema changes. Metadata object stored as JSON column.

---

### Question 4: Account Lookup and Visibility
**Options presented:**
- Self-only (users view only their own account)
- Admin lookup (operators can look up any account)
- Business context lookup (visible within business team)

**User selection:** Admin lookup: operators can look up any account

**Rationale:** Supports operator support workflows and auditing without exposing private accounts to all team members.

---

## Area 2: Session and Tenant Binding

### Question 1: Login and Tenant Auto-Binding
**Options presented:**
- Auto-bind single tenant (if user has one business)
- Separate tenant selection endpoint
- Return both options

**User selection:** Auto-bind single tenant

**Rationale:** If user has exactly one business, login binds to it automatically. If multiple businesses, login returns the list for client to select. Reduces friction for single-business users.

---

### Question 2: Tenant Context Passing
**Options presented:**
- Header (x-tenant-id / x-company-token)
- Path parameter (/tenants/:tenantId/...)
- Auth token contains tenant ID

**User feedback:** "I like the header one, but we need to match the decided convention, so it could be x-business-id instead"

**Decision locked:** Use request header. Specific header name (x-business-id vs. x-company-token) must match the convention decided in Phase 1-3. This is a dependency on prior architectural decisions, not a new choice.

**Rationale:** Headers are clean, follow REST convention, compatible with existing backend middleware. But consistency across phases is critical.

---

### Question 3: Session Expiration and Refresh Tokens
**Options presented:**
- Short-lived access token + refresh token
- Longer-lived session cookie (24-48 hours)
- Match existing backend behavior

**User selection:** Match existing backend behavior

**Rationale:** Maintains consistency during the migration period and avoids introducing divergent token policies between legacy and new APIs.

---

### Question 4: Logout Behavior
**Options presented:**
- Stateful revocation (immediate backend invalidation)
- Stateless (client-side cleanup only)
- Hybrid (soft invalidation with grace period)

**Initial selection:** Stateless: client-side cleanup only

**Reconsidered during discussion:** User requested to revisit this decision.

**Final selection:** Stateless: client-side cleanup only (confirmed)

**Rationale:** Aligns with stateless JWT/token model. Tokens remain valid until they naturally expire. Simpler session management, compatible with existing architecture.

---

## Area 3: Business Owner Permissions and Scope

### Clarification: Business = Tenant
**User identified confusion:** "Tenancy" seemed to be a separate domain, but in the DGFY design, **Business and Tenant are the same thing.** Each business owns one tenant database (dgfy_business_*). This clarification led to the decision to fold "Tenancy APIs" into "Businesses APIs" (see Area 4).

### Question 1: Scope Model (Role vs. Capability)
**Options presented:**
- Role-based (owner/manager/staff with fixed capabilities)
- Capability-based (explicit feature flags)
- Membership + role (role defines within-business permissions)

**User selection:** Role-based with fixed capabilities

**Rationale:** Simple and familiar. Owner can do everything, manager can manage staff and day-to-day operations, staff can execute operations within their assigned branch.

---

### Question 2: Business Creator as Owner
**Options presented:**
- Automatic owner assignment on creation
- Separate role assignment step
- Creator role pending acceptance

**User selection:** Automatic owner assignment

**Rationale:** When an account creates a new business, they immediately become the owner. No extra step required.

---

### Question 3: Staff Onboarding
**Options presented:**
- Email invitations only (async)
- Direct add only (sync)
- Both, owner chooses

**User selection:** Both invitations and direct add, owner discretion

**Rationale:** Flexible for different onboarding scenarios. Some staff can be invited via email; others can be added directly. Owner decides per staff member.

---

### Question 4: Branch and Location Management Scope
**Options presented:**
- Businesses APIs (/businesses/:id/branches)
- Tenancy APIs (/tenancy/:tenantId/branches)
- Both (branches under both paths)

**User selection:** Businesses APIs

**Rationale:** Branches belong to businesses. Since business = tenant, it's natural to manage branches through the business endpoints. Cleaner and more intuitive from a business owner's perspective.

---

## Area 4: API Endpoint Organization

### Critical Clarification: Tenancy ≠ Separate Domain
**User identified:** The terminology in ROADMAP.md used "Tenancy APIs" as a domain, but this was confusing because "Tenancy" isn't an entity — it's an operational concept (tenant context resolution). Since Business = Tenant, we should fold "Tenancy" into "Businesses."

**Decision:** Three route modules:
- `/api/v1/accounts` — Authentication, profile management
- `/api/v1/businesses` — Business CRUD, staff, branches, AND tenant session management
- (No separate `/tenancy` module)

---

### Question 1: Route Module Organization
**Options presented (updated based on clarification):**
- Three separate modules (/accounts, /businesses, /tenancy)
- One unified identity module
- Follow existing /dgfy pattern

**User selection (initial):** Fold tenancy into businesses (Option 2, restructured)

**User feedback on mid-session business switching:** "I mean business" — User clarified they meant switching between their multiple businesses during a session, not just theoretical tenancy switching.

**Decision:** Use a separate endpoint (`POST /businesses/:businessId/activate-session`) to switch which business a user is working in. This allows:
1. Login returns unbound session + business list
2. Client selects which business to activate via a dedicated endpoint
3. Mid-session, user can call the activation endpoint again to switch to a different business
4. No need to re-authenticate to switch between owned businesses

**Rationale:** Supports the common workflow where a business owner manages multiple businesses and needs to switch between them without logging out.

---

## Summary of Decisions

| Decision | Choice | Category |
|----------|--------|----------|
| Email verification | Optional/configurable | D-01 |
| Password recovery | Use existing OTP pattern | D-02 |
| Account profile fields | Extensible with metadata | D-03 |
| Account lookup | Admin-only endpoint | D-04 |
| Login auto-binding | Auto-bind single tenant | D-05 |
| Tenant context header | Match existing convention | D-06 |
| Session lifetime | Match existing backend | D-07 |
| Logout behavior | Stateless, client cleanup | D-08 |
| Permissions model | Role-based (fixed capabilities) | D-09 |
| Business creator role | Automatic owner assignment | D-10 |
| Staff onboarding | Both invite + direct add | D-11 |
| Branch management | Through Businesses APIs | D-12 |
| Module structure | Fold tenancy into businesses | D-13 |
| Business activation | Separate endpoint for switching | D-14 |

---

## Deferred Ideas

- **Staff "Link to DGFY" feature** — Mentioned in account hierarchy docs but deferred. Staff can log into POS without a full DGFY Account. Linking is a future feature once there's a concrete use case.
- **Co-ownership for businesses** — Data model supports it, but MVP has single owner. Future phase.
- **Branch Manager role** — Mentioned in account hierarchy. Deferred to future phase. MVP focuses on Owner and Staff roles.

---

## Key Insights from Discussion

1. **Clarification on Business = Tenant:** This was a critical terminology issue. The DGFY design document clearly states that a Business is a Tenant (one tenant database per business). This clarification resolved the confusion about having a separate "Tenancy" domain and led to the decision to fold tenancy-related operations into the Businesses APIs.

2. **Mid-Session Business Switching:** User clarified that they need to support switching between multiple businesses the same user owns, without re-login. This informed the decision to use a separate business activation endpoint rather than bundling tenant selection into the login flow.

3. **Consistency Over New Patterns:** Multiple decisions (session lifetime, logout behavior, header conventions) were deferred to "match existing backend behavior" rather than introducing new patterns. This reflects the migration context — parallel APIs need to be compatible during the cutover period.

4. **Extensibility Over Prescriptive Schema:** Account profile design chose extensible metadata over fixed fields, allowing future customizations without schema migrations.

---

## Next Steps for Planner

- Verify the exact header convention locked in Phase 1-3 (likely `x-company-token` or `x-business-id`)
- Design the exact signature of the business activation endpoint (POST /businesses/:id/activate-session or similar)
- Determine whether to expose a separate `/admin/accounts` endpoint or role-gate account lookup within `/accounts`
- Plan how staff invitations will be sent and tracked (database table structure, email template, expiration windows)
- Consider integration with Phase 3's legacy-to-DGFY ID mapping for account migrations during the cutover

---

*Discussion facilitated: 2026-07-11*
*Decisions locked for planning phase*
