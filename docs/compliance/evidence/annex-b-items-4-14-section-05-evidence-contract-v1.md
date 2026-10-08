# Annex B Items 4 to 14 — Section 05 Evidence Contract

Status: `LOCAL_RUNTIME_VERIFIED_EXTERNAL_REVIEW_REQUIRED`

This contract records the local implementation and verification boundary for
`05_EJournal_Reports_and_Evidence_Exports.docx`. It does not claim that the
internal serializer grammar has been accepted by BIR, a tax practitioner, a
provider, or a technical working group.

## Implemented local scope

- Phase 357 publishes a registry-backed report applicability catalog in POS
  Business Admin and deterministic sanitized samples for sales summaries,
  statutory/commercial discounts, refunds/voids/adjustments, tender,
  terminal/register reports, X/Z readings, the separate books/eSales package,
  inventory when relevant, and audit activity.
- Phase 358 serializes one bounded daily e-journal from immutable fiscal
  snapshots, adjustment records, fiscal reading events, and persisted Z
  snapshots. The output contains `FILE`, `DOCUMENT`, `LINE`, `PAYMENT`,
  `ADJUSTMENT`, `READING`, and `TRAILER` records.
- Raw text, a hard-copy projection, printable HTML, and a JSON manifest expose
  the source filename, serializer version, record count, date, checksum, and
  external-review boundary.
- Requests require Business Admin report view permission; downloads also
  require report export permission. Branch scope, one-business-date scope,
  terminal scope, source-row bounds, audit events, and deterministic retries
  are enforced.

## Evidence

- Machine-readable contract: `annex-b-items-4-14-section-05-evidence-contract-v1.json`
- Report samples: `annex-b-items-4-14-section-05-report-sample-fixtures-v1.json`
- Internal grammar: `annex-b-ejournal-readiness-grammar-v0.1.md`
- Canonical sanitized e-journal fixture: `annex-b-ejournal-readiness-fixture-v0.1.txt`
- Local execution report: `output/plans/POS_BIR_Annex_B_Items_4_to_14_Readiness/execution/EXEC-05_EJournal_Reports_and_Evidence_Exports.docx`

## Explicit boundary

The internal grammar version is `EJOURNAL-READINESS-0.1`. External grammar,
retention, printer/hard-copy, tax treatment, and provider/BIR review remain
pending. No source file or export manifest may state or imply external
approval.
