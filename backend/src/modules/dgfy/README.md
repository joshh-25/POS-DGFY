# DGFY Module

## Purpose

Owns global DGFY account identity that exists before tenant selection.

This module supports:

- global DGFY account registration and login;
- authenticated DGFY account bootstrap;
- landlord membership links between DGFY accounts and tenant users;
- authenticated acceptance of pending company invitations from the DGFY account surface.

## Boundaries

- Controllers stay transport-only.
- Account and membership logic lives in use cases and repositories.
- Landlord-scoped models are used only through this module or explicit dependency injection into cross-boundary tenant registration use cases.
- Tenant-local storefront customer and SKUpervisor staff records remain separate records linked through DGFY account membership, not replacements for the global account.

## Validation

Run:

```bash
npm run check:architecture
npm --prefix backend test -- --runTestsByPath tests/registerCompanyRequestUseCase.autoApproval.test.js
npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js
```
