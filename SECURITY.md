# Security Policy

DGFY is a multi-tenant commerce platform for Philippine MSMEs (inventory, POS, storefronts, and payments). This document explains how to report a security issue and what to expect from us.

This is the security counterpart to our regulatory compliance program (`docs/compliance/`), which covers BIR/NPC/BSP fiscal and data-handling requirements. This file covers vulnerability disclosure. For the full picture of what's implemented and what's planned, see `docs/security/ASSURANCE_ROADMAP.md`.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email **security@dgfy.ph** with:
- A description of the issue and its potential impact
- Steps to reproduce (proof-of-concept code or requests are welcome)
- The affected component/URL if known (e.g. `skupervisor.dgfy.ph`, `dgfy.ph`, a POS terminal endpoint, the Android app)

<!-- TODO(security-team): security@dgfy.ph is a placeholder — point it at a real monitored inbox before publishing this file, and update `/.well-known/security.txt` (tracked in issue #250) to match. -->

If you'd rather not email, you may also open a private security advisory via GitHub's "Report a vulnerability" feature on this repository (Security tab → Advisories), once repository security features are enabled (tracked in #238).

### What to expect

- **Acknowledgement:** within 3 business days.
- **Initial assessment:** within 10 business days, including a severity estimate and next steps.
- **Resolution timeline:** communicated once triaged; critical issues affecting production data or payments are prioritized immediately.
- We will keep you informed of progress and credit you (if you'd like) once the issue is resolved, unless you prefer to stay anonymous.

### Safe harbor

We will not pursue legal action against, or refer to law enforcement, anyone who:
- Makes a good-faith effort to avoid privacy violations, data destruction, and service disruption during their research
- Only interacts with accounts/data they own or have explicit permission to test
- Reports findings to us promptly and privately, and gives us reasonable time to remediate before any public disclosure
- Does not access, modify, or exfiltrate merchant or customer data beyond what's needed to demonstrate the issue

This applies to good-faith security research. It does not cover fraud, social engineering of our staff or customers, physical attacks, or denial-of-service testing against production.

## Scope

**In scope:**
- `dgfy.ph`, `skupervisor.dgfy.ph`, `pos.*.dgfy.ph`, and other `*.dgfy.ph` production subdomains
- The DGFY backend API and its dependencies
- The Android iMin POS wrapper and the desktop/Electron POS client
- Custom tenant storefront domains served by this platform

**Out of scope (for now):**
- Third-party services we integrate with (PayMongo, PayPal, Sentry, PostHog, OpenAI, Brevo) — report those directly to the provider
- Denial-of-service or volumetric testing against production
- Automated scanning that generates significant traffic without prior coordination — email us first and we'll set up a safe window

## Supported versions

DGFY is a continuously-deployed platform, not a versioned release train — only the current production deployment is supported. There is no LTS or backport policy.

## Our security posture, briefly

We run tenant-isolated (database-per-tenant) infrastructure, rotate refresh tokens, rate-limit and CSRF-protect all state-changing requests, verify all payment webhooks with signature checks, and scrub PII from our error-tracking and analytics tooling. A full self-assessment against OWASP ASVS is tracked in `docs/security/ASSURANCE_ROADMAP.md` and the linked issues. We do not yet hold a third-party certification (SOC 2, ISO 27001) — see the roadmap for when and why that changes.
