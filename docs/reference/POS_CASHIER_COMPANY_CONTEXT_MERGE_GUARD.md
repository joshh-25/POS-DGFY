# POS Cashier Company Context — Merge Guard

## Symptom

After successful cashier sign-in and terminal selection, **Unlock POS** displays:

> Select the company before unlocking the terminal.

The backend can be healthy and cashier login can already have returned HTTP 200.

## Root cause

Standalone POS requires both company identifiers throughout login:

- `companyToken` routes tenant API requests.
- `tenantId` identifies the business used to open or resume a shift.

The regression occurs when authentication keeps `companyToken` but drops `tenantId` before creating `cashierUnlockSession`. Unlock then reads an empty `cashierUnlockSession.tenantId` and incorrectly reports that no company was selected.

## Required state flow

1. `/auth/lookup` resolves the email to complete tenant options.
2. `/pos/auth/cashier-login` validates the cashier password in each candidate tenant.
3. Only authenticated tenants may appear in the company picker.
4. `authenticateCashierCredentials` returns `cashierUser`, `companyToken`, and `tenantId`.
5. `startCashierLoginFlow` stores all three in `cashierUnlockSession`.
6. `handleTerminalUnlockSubmit` uses the stored `tenantId` to open the shift.

Never restore physical-device pairing state or `setPairedTerminalContext`. Terminals are logical branch/location records; cashier authentication and shift ownership control access.

## Merge-conflict checklist

When resolving `frontend/src/features/pos/pages/TerminalPage.jsx`, preserve these contracts:

- `lookupCompanySelection` returns the complete tenant option.
- Wrong passwords reveal no company choices.
- `cashierUnlockSession` contains `companyToken` and `tenantId`.
- No `setPairedTerminalContext` call exists.
- Valid cashier login opens the opening-cash dialog without another company-selection error.

## Local regression validation

```powershell
cd C:\xampp\htdocs\POS-DGFY\frontend
npx vitest run src/features/pos/__tests__/terminalPairing.contract.test.js src/features/pos/__tests__/terminalSessionSource.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js
npm run build:pos
```

Playwright must verify:

- Wrong password: HTTP 401, no company picker, no shift dialog.
- Valid password: opening-cash dialog appears and unlocking does not show the company-selection error.
