# Tenant Revenue Module

Owns versioned tenant fee policy, PayMongo financial snapshots, immutable ledger
entries, reconciliation exceptions, settlement batches, carry-forward
refund/chargeback/adjustment allocation, and controlled payout evidence.

Boundary:

`routes/tenantRevenue.js -> controllers -> usecases -> repositories -> landlord models`

Safety invariants:

- money is integer centavos;
- posted ledger entries are immutable and idempotent;
- tenant reads are server-scoped;
- payout account data is encrypted and only masked values leave the backend;
- settlement requires reconciliation and maker-checker approval;
- paid state requires provider/bank reference plus proof;
- automatic payout remains fail-closed without external approval and an approved adapter;
- PayMongo split mode and tenant revenue sharing cannot be enabled together.

Authoritative design: `docs/architecture/adr/0040-tenant-revenue-collection-ledger-and-settlement.md`.
