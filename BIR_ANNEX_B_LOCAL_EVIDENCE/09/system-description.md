# OPIS + POS local system description

Evidence label: LOCAL TEST - NOT FOR SUBMISSION
Generated: 2026-10-27T05:56:18.762Z
Source revision: 2ac2c03bf01e9d27ddeb2fcd8d1c2b9d5e43b60d9446590a2dfcb1c4ba29dafd

## Scope
This document describes only the local OPIS/POS/API/database runtime used for this evidence run. It does not describe staging or production and does not claim BIR approval.

## Components
- POS frontend: local POS Vite surface at http://127.0.0.1:5182.
- OPIS frontend: the local Business Admin surface is part of the same source tree and uses the Business Admin API routes.
- Backend API: local API at http://127.0.0.1:5002, with route -> controller -> use-case -> repository -> model boundaries.
- Database: local MySQL tenant data selected through tenant session f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a.
- Receipt/fiscal source: persisted POS transaction fiscal snapshots and the shared receipt renderer.
- Adjustments: persisted POS transaction adjustments and fiscal event/audit records.
- Readings: POS X-reading and Z-reading endpoints and persisted Z-reading snapshots.
- Reports/e-journal: registry-backed Business Admin reports and the bounded e-journal evidence endpoint.

## Verified flow
The local flow is operator login -> tenant session -> POS shift/catalog -> finalized transaction source -> adjustment/readings/report outputs -> e-journal export -> audit records. The selected local scope was business date 2026-10-02, location 3, terminal COUNTER-01.

## Evidence boundary
The run records actual returned local outputs. It does not relabel non-fiscal records as fiscal invoices, invent tax IDs, or claim external accreditation.
