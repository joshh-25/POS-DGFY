# SMS delivery

Provider-neutral outbound SMS contract used by transactional order-received and order-delivered
alerts and consent-gated promotional messages. The `fake`
adapter is opt-in outside production and records only simulated acceptance. The default adapter is
`unconfigured`, which never claims delivery. One landlord-scoped log row is written per recipient;
message content is never persisted. Raw normalized phone numbers are redacted after the configured
retention window while their HMAC and coarse prefix remain.

The adapter contract is `send({ id, to, purpose, content, correlation })`. A provider must be added
under `adapters/` and selected explicitly; provider setup and sandbox verification are in
`docs/ops/OUTBOUND_SMS_PROVIDER_ONBOARDING.md`. Transactional order alerts are best-effort and
dispatched after commit with a five-second caller bound; each real provider adapter must enforce
its own request timeout.

Promotional sends require tenant-specific active consent, pass a global phone-hash suppression
check, and append the caller's approved opt-out instruction. Missing or unavailable consent state
fails closed. This wave offers manual authenticated grant/revoke routes; inbound STOP capture and
suppression removal are not implemented. Keep `SMS_PHONE_HASH_SECRET` stable or re-key all consent,
event, suppression, and SMS delivery hashes before rotating it.
