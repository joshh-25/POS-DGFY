# Testing Docs

When to use:
1. Test/audit definitions and validation protocols
2. Measurement and telemetry verification rules
3. Production-readiness evidence

## Evidence Classification (Phase 65.2)

Use this table to avoid over-claiming what a green test run proves.

| Evidence type | Typical examples | What it proves | What it does not prove |
|---|---|---|---|
| Syntax / unit mocks | isolated use-case/service unit tests | Branch logic, error mapping, payload shaping | Real network/provider behavior, real user behavior |
| Transport/controller tests | handler transport contract tests | HTTP wiring, token/header forwarding, status/payload contracts | Provider reality, DB persistence parity in production |
| DB integration tests | `supertest` + real test DB suites | Route-level state transitions and telemetry persistence in controlled env | Production ingress parity, adoption/retention |
| Live sandbox tests | PayPal sandbox canary E2E suites | Real provider verification flow + backend transition contracts | Production traffic behavior, customer engagement depth |
| Production evidence | reconciliation dashboards, longitudinal audits | Real-world behavior over time in deployed environment | Causal impact without controlled experiments |

## Claim Guardrail

Current approved claim language for subscription telemetry:
1. "Billing funnel telemetry integrity is validated across unit, transport, integration, and sandbox layers."
2. "Selected backend-observed product usage events are recorded."

Disallowed claim language until production longitudinal evidence exists:
1. "This proves real-world engagement."
2. "This proves retention or adoption causality."
