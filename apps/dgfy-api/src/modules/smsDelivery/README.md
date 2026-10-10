# SMS delivery

Provider-neutral outbound SMS contract for later order-alert and promotional features. The `fake`
adapter is opt-in outside production and records only simulated acceptance. The default adapter is
`unconfigured`, which never claims delivery. One landlord-scoped log row is written per recipient;
message content is never persisted. Raw normalized phone numbers are redacted after the configured
retention window while their HMAC and coarse prefix remain.

The adapter contract is `send({ id, to, purpose, content, correlation })`. A provider must be added
under `adapters/` and selected explicitly; provider setup and sandbox verification are in
`docs/ops/OUTBOUND_SMS_PROVIDER_ONBOARDING.md`.
