---
status: reference
authority_level: reference
owner: security
last_reviewed: 2026-08-05
applies_to: security_assurance_program
topic: security_assurance_roadmap
---

# Security Assurance Roadmap

## Purpose

This document answers three questions a non-specialist should be able to answer just by reading it:

1. What do we do **now**, for free?
2. What do we do **next**, and what triggers moving to it?
3. What do we tell a merchant, partner, or regulator who asks "is my data safe with you"?

It is the assurance counterpart to `docs/compliance/` (which covers BIR/NPC/BSP *fiscal and regulatory* compliance) and to `SECURITY.md` (which covers vulnerability disclosure). This roadmap covers everything in between: what security work we do, in what order, and why.

Full audit context and the tracking epic: GitHub issue #252 ("Security Program: audit, hardening, and assurance roadmap").

## The four audiences this serves

| Audience | What they need from us |
|---|---|
| MSME merchants (our tenants) | Plain-language proof their sales/customer data is handled responsibly — a Trust page, a privacy policy, a DPA |
| PH regulators (NPC, BIR, BSP) | Legal compliance — NPC registration/DPO (Tier 1 below), and the existing BIR/BSP program in `docs/compliance/` |
| Enterprise/partner due diligence | Evidence — a pen test report, eventually a certification, answers to security questionnaires |
| Ourselves | Actual breach-risk reduction — this is what the numbered GitHub issues under #252 are for |

## The ladder

### Tier 0 — now, ~free

Everything here is configuration or documentation work, achievable without new spend. This is where most of the child issues under #252 live.

- `SECURITY.md` + vulnerability disclosure policy (done — this repo's root)
- `/.well-known/security.txt` (#250)
- GitHub Dependabot alerts + security updates, gitleaks, Semgrep OSS in CI (#238)
- Branch protection, `CODEOWNERS`, org 2FA (#238)
- OWASP ASVS Level 2 self-assessment, recorded as a control matrix mirroring `docs/compliance/control-matrix.md` (#249)
- OWASP ZAP baseline scan in CI (#249)
- Public Trust page in merchant-readable language (#250)
- Subprocessor list: PayMongo, PayPal, Brevo, OpenAI, Sentry, PostHog, OpenFreeMap, GHCR (#250)
- Privacy policy for DGFY/storefront consumers + merchant Data Processing Agreement template (#250) — built on the legal-acknowledgement delivery mechanism that already exists (`dgfyLegalTerms.js`, `DgfyLegalAcknowledgement`)

**This tier alone answers most of an early-stage partner's security questionnaire and every merchant-trust question.**

### Tier 1 — mandatory now, regardless of company size

This is Philippine law, not a growth-stage nice-to-have, and it does not wait for revenue:

- Appoint a Data Protection Officer (DPO) for Sieitz
- Register with the National Privacy Commission (NPC)
- Write a Privacy Manual
- Run a Privacy Impact Assessment (PIA)
- Document the 72-hour breach notification procedure required under the Data Privacy Act of 2012 (RA 10173)

Full detail: issue #244. Note this is distinct from control `NPC-01` in `docs/compliance/control-matrix.md`, which tracks *tenant merchants'* DPO/DPS obligations — this tier is Sieitz's own obligation as the platform operator processing that data.

### Tier 2 — first paid step (~₱150,000–800,000/year)

**Trigger:** the first partner or enterprise deal that sends us a security questionnaire, or whenever we want a credible external answer to "have you been tested."

- One annual third-party penetration test, scoped to the production web/API surface and (once it exists) the mobile/POS clients
- A shareable summary report we can send under NDA

This is the single highest-credibility artifact per peso available to us. It does not require SOC 2/ISO scale of investment and answers most enterprise questionnaires on its own.

### Tier 3 — only when a named deal depends on it (~₱1,200,000–3,000,000+, 6–12 months)

**Trigger:** a specific enterprise or platform-partner deal that is explicitly blocked on SOC 2 or ISO 27001 certification. Not before — this is expensive and slow, and premature investment here delays everything in Tier 0/1 that serves more immediate needs.

- SOC 2 Type II *or* ISO 27001, run through a compliance automation platform (e.g. Vanta, Drata) plus an external auditor
- The evidence discipline already built for `docs/compliance/` (control matrices, impact declarations, CI-enforced evidence) ports over well to this when the time comes — this is not starting from zero

## A note on PCI DSS

We never ask this question directly, but partners will: **what's our PCI DSS scope?**

Because storefront checkout hands off to PayMongo/PayPal-hosted payment flows, cardholder data never touches DGFY servers. That puts us in **SAQ-A** (Self-Assessment Questionnaire A) — the lightest PCI DSS tier, a self-assessment we complete ourselves, not a third-party audit. Full detail and the completed statement: issue #242.

## How this roadmap gets used

- New merchant-facing trust material should link here, not restate it.
- When a partner sends a security questionnaire, this document plus the ASVS self-assessment (#249) should answer 80%+ of it directly.
- Revisit the Tier 2/3 triggers whenever a real deal is on the table — don't pre-invest in certification speculatively.
- Keep `last_reviewed` above current; this is a living document, not a one-time artifact.
