---
status: authoritative
authority_level: authoritative
owner: compliance
last_reviewed: 2026-06-01
applies_to: ph_pos_software_provider
topic: ph_pos_software_developer_compliance
related_adr: 0007-dual-mode-pos-compliance-program.md,0011-compliance-downgrade-escape-hatches.md,0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md
---

# PH POS Software Developer Compliance Guide

## Purpose
Canonical compliance baseline for the dual-mode POS program:
1. `non_compliant_active`
2. `compliant_pending`
3. `compliant_active`

This guide defines regulator-aligned controls to enforce in product logic, persistence, CI guardrails, and development workflow.

## Regulatory Source Chain (Authoritative Inputs)
1. BIR RR 7-2024 (registration and invoicing requirements)
   - https://bir-cdn.bir.gov.ph/BIR/pdf/RR%207-2024%20%28final%29.pdf
2. BIR RR 11-2025 (electronic invoicing and electronic sales reporting coverage)
   - https://bir-cdn.bir.gov.ph/BIR/pdf/RR%2011-2025%20Digest.pdf
3. BIR RR 26-2025 (transitory extension and timeline update)
   - https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2026-2025%20Digest.pdf
4. BIR RMO 24-2023 (CRM/POS accreditation and registration procedures)
   - https://bir-cdn.bir.gov.ph/local/pdf/RMO%20No.%2024-2023%20Digest%20FINAL.pdf
5. BIR RMC 72-2025 (accreditation validity context and RR linkage)
   - https://www.bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2072-2025%20Digest.pdf
6. NPC Circular 2022-04 (PIP/PIC registration and annual update controls)
   - https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf
7. NPC security and operational updates (including current registration/ASIR workflows)
   - https://privacy.gov.ph/
8. BSP OPS framework baseline
   - Circular 1049: https://www.bsp.gov.ph/Regulations/Issuances/2019/c1049.pdf
   - PSOF reference: https://www.bsp.gov.ph/Regulations/Issuances/2020/1089.pdf
   - MORPS consolidation context: https://www.bsp.gov.ph/Regulations/Issuances/2024/1191.pdf
   - OPS FAQ: https://www.bsp.gov.ph/PaymentAndSettlement/FAQ_OPS_Registration.pdf

## Product Compliance Model
1. Mode lifecycle is irreversible toward compliant states except governed escape hatches:
   - Platform admin force downgrade (`compliant_* -> non_compliant_active`) with reasoned audit trail.
   - Tenant master-admin one-time revert per compliance cycle (`compliant_* -> non_compliant_active`) with cycle tracking.
2. Legacy tenants must complete one-time mode selection before gated operations.
3. Non-compliant mode issues only `non_fiscal_slip`.
4. Fiscal behavior is allowed only in `compliant_active`, fail-closed on policy failure.
5. Verified-only trust model applies to artifacts and peripherals in compliant mode.
6. RMO 24-2023 filing readiness is a separate activation gate. Generic profile, artifact, peripheral, and submission-document completion is not enough for fiscal activation unless `rmo_filing_readiness.ready=true`.
7. Verified fiscal terminal registration is also required before `compliant_active`; non-compliant and compliant-pending tenants remain limited to non-fiscal output.

## Mandatory Control Objectives
1. BIR controls:
   - Lifecycle gating for fiscal issuance.
   - Mandatory invoice/receipt metadata and contract enforcement.
   - Terminal-aware accredited peripheral checks with shared fallback.
   - RMO 24-2023 filing evidence, fiscal document sample review, verified fiscal terminal registration, fiscal integrity proof, and eSales/reporting rehearsal before `compliant_active`.
   - Internal fiscal runtime controls: server-owned fiscal document snapshots, fiscal print/reprint evidence, fiscal void stock-return evidence, sequenced fiscal event ledger verification, and eSales package/status evidence.
2. NPC controls:
   - DPO and registration profile requirements.
   - Breach-response and security control confirmations.
   - Auditability for mode transitions and verification actions.
3. BSP controls:
   - OPS-required determination and status validity.
   - Payment-control review gates.
   - Deny payment capability when controls are unmet.

## Engineering Guardrails
1. Runtime policy engine remains fail-closed for compliant mode.
2. DB-level transition guardrails block generic compliant downgrade and allow only governed override/revert paths.
3. Controlled downgrade trigger semantics are strict:
   - downgrade must mutate governed markers in the same update;
   - mixed override+revert marker mutations in one downgrade update are rejected;
   - tenant revert must persist `compliance_revert_last_cycle_version = compliance_cycle_version`.
4. Force/revert operations are fail-closed on audit durability; primary compliance audit persistence is required to commit.
5. CI and pre-commit enforce compliance declarations on sensitive changes.
6. Request-time preflight blocks implementation on `breach` and `review_required`.

## Release Gates
1. `npm run lint:docs`
2. `npm run check:architecture`
3. `npm run check:compliance`
4. Compliance-focused backend and frontend tests
5. RMO filing readiness evidence when fiscal activation or receipt/reporting behavior is affected
6. Updated declaration evidence with rollback notes
7. Fiscal ledger integrity verification evidence when fiscal event behavior changes

## Cadence
1. Regulator-source verification monthly.
2. Additional regulator verification at each release cut.
3. Policy packs and control mapping updated before behavior changes when issuances shift.
