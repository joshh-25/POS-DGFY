# Deployment Docs

When to use:
1. Release and transition procedures
2. Environment change guidance
3. Production cutover safety steps

Primary deployment references:
- `docs/ops/PRODUCTION_CHECKLIST.md` (step-by-step production execution checklist)
- `docs/ops/NO_STAGING_RELEASE_STANDARD.md` (hard gate policy when staging is unavailable)
- `docs/deployment/PWA_SURFACE_CONTRACT.md` (manifest/service-worker contracts and installability validation for SKUpervisor, POS, and Storefront)
- `docs/guides/SCRIPTS_GUIDE.md` (canonical behavior for `scripts/deploy.sh` and `scripts/deploy-remote.sh`)
- `docs/reference/QUICK_REFERENCE.md` (fast command snippets for operators)
- `docs/reference/DEPLOYMENT_HARDENING_CLOSURE_2026-04-19.md` (latest deploy hardening closure evidence and residual-gap note)

Historical transition notes:
- `docs/archive/deployment/2026-02-19/transition-guide.md`

Notes:
- Root-level `DEPLOYMENT_GUIDE.md` and `TROUBLESHOOTING.md` are compatibility pointers to canonical docs under `docs/ops` and `docs/setup`.
- For persistent passwordless deploy access, see the SSH setup section in `docs/guides/SCRIPTS_GUIDE.md`.
