# Services Module

Owns Services Mode catalog metadata, resources, appointment bookings, waitlist hooks, reminders, intake responses, payment timing handoff, service tickets, and guest/account claim decisions.

Boundary rules:
- Routes stay in `src/routes/services.js` and `src/routes/store.js`.
- Controllers in `controllers/` only adapt transport to use cases.
- Use cases in `usecases/` own service booking lifecycle, account-action decisions, and payment handoff decisions.
- Repositories in `repositories/` own Sequelize access for service catalog, resources, bookings, waitlist data, reminders, and client history.
- Shared mode capability checks stay in `src/middleware/workflowModeCapability.js` and shared mode metadata stays in `src/modules/shared/constants/workflowModes.js`.

Availability contract:
- `service_resources.weekly_availability` supports day keys by number (`0`-`6`), full lowercase day name (`monday`), or three-letter day key (`mon`).
- Each day can be one slot object, an array of slot objects, or a `"HH:mm-HH:mm"` string.
- Slot objects use `start`/`end`, `from`/`to`, or `open`/`close`.
- `service_resources.blackout_dates` is an array of ISO date strings; matching dates reject bookings.
- If active provider/resource assignments exist for a service, selected provider/resource/location must match at least one active assignment.
- `GET /api/v1/store/services/availability` is the public no-store availability read contract. It accepts service/date/location/resource/provider/quantity inputs and returns only slots that currently pass service bookability, explicit sale-price readiness, lead time, assignment compatibility, resource weekly availability, blackout dates, overlapping booking quantity capacity, and active unexpired booking holds. The response includes structured diagnostics for unavailable slots/setup gaps and uses a window-level conflict query when the repository supports it. Booking mutations remain authoritative and revalidate under transaction/lock.
- `POST /api/v1/store/services/holds` creates a short-lived public booking hold for the selected service schedule/capacity anchor. Holds are stored in `service_booking_holds`, require an `idempotency_key`, expire after the configured short TTL, are counted by availability/capacity checks while active, may replace a previous active hold from the same service draft, and are consumed by the final booking mutation through `hold_token`.

Reminder contract:
- Due appointment reminders are queued in `service_reminder_outbox`.
- `POST /services/reminders/queue-due` creates pending email reminders for upcoming requested/confirmed bookings with customer email addresses.
- `POST /services/reminders/send-due` processes pending due reminders through the configured SMTP email service.
- If email is not configured, reminders are marked `skipped` with `email_not_configured` so the service desk has an auditable outcome.
- SMS is represented as a future channel in the outbox but is not dispatched until an SMS provider adapter is added.

Intake contract:
- Service catalog entries may store `intake_form_schema` with `fields` or `questions`.
- Storefront booking renders supported field types (`text`, `textarea`, `select`, `checkbox`, `number`, `date`) and sends answers as `service_bookings.intake_responses`.
- Storefront service bookings support `quantity >= 1`; capacity checks sum overlapping active booking quantities. Quantity above `1` requires a capacity anchor: currently an active assigned service resource. Provider-only and location-only bookings remain effective capacity `1`. If a storefront request omits `resource_id`, the use case may auto-select an assigned resource with enough compatible capacity.
- Public service booking hold and booking mutations require `idempotency_key`; matching retries replay the existing hold/booking response and conflicting reuse is rejected.
- Public batch booking uses `/api/v1/store/services/bookings/batch` and is all-or-nothing. Batch responses include `payments[]` for per-booking payment handoffs; the singular `payment` field is a summary only.
- Required Storefront intake fields block booking until completed.
