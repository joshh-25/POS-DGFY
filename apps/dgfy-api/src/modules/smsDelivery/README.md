# SMS delivery

Provider-neutral outbound SMS contract used by transactional order-received and order-delivered
alerts, with later promotional features subject to separate consent work. The `fake`
adapter is opt-in outside production and records only simulated acceptance. The default adapter is
`unconfigured`, which never claims delivery. One landlord-scoped log row is written per recipient;
message content is never persisted. Raw normalized phone numbers are redacted after the configured
retention window while their HMAC and coarse prefix remain.

The adapter contract is `send({ id, to, purpose, content, correlation })`. A provider must be added
under `adapters/` and selected explicitly; provider setup and sandbox verification are in
`docs/ops/OUTBOUND_SMS_PROVIDER_ONBOARDING.md`. Transactional order alerts are best-effort and
dispatched after commit with a five-second caller bound; each real provider adapter must enforce
its own request timeout.
