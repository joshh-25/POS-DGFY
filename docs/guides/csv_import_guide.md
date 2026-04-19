---
status: reference
authority_level: reference
owner: inventory
last_reviewed: 2026-04-18
applies_to: items_csv_import_export
topic: workflow_mode_csv_templates
---

# CSV Import/Export Guide for Inventory Items

## Overview
Use CSV import/export to manage inventory items in bulk. CSV import now enforces tenant workflow mode compatibility:

1. `manufacturing` template imports only in manufacturing tenants.
2. `msme` template imports only in MSME tenants.
3. Mismatch is blocked during both preview and confirm import with a deterministic validation error.

Workflow mode behavior is aligned with ADR 0008 (`manufacturing` vs `msme`) and remains independent from compliance lifecycle.

## Limits

| Parameter | Value |
|-----------|-------|
| Maximum items per import | 1,000 |
| Maximum file size | 10 MB |

## Downloading Templates

Template endpoint:

`GET /items/import/template?workflow_mode=<manufacturing|msme>`

Supported query params:

1. `workflow_mode` (primary): `manufacturing` or `msme`
2. `type` (legacy compatibility): accepted but mode templates are now the primary contract

Current filenames:

1. `manufacturing_items_import_template.csv`
2. `msme_items_import_template.csv`

Both templates include machine-readable marker columns:

1. `template_workflow_mode`
2. `mode_compatibility_note`
3. `template_schema_version`
4. `template_issued_at`
5. `template_signature`

## Template Behavior by Mode

### Manufacturing Template
Includes manufacturing-oriented fields (for example product processing fields like `batch_size`, `yield_percentage`, `processing_loss`, plus compatibility marker columns).

### MSME Template
Uses a simplified schema and includes MSME-critical pricing fields:

1. `cost_per_unit`
2. `default_sale_price`

This supports MSME non-draft pricing requirements while keeping the template smaller than the manufacturing variant.

## Import Flow

1. Download the template matching the tenant workflow mode.
2. Upload CSV to preview endpoint.
3. Fix row errors if needed.
4. Confirm import.

Endpoints:

1. `POST /items/import/preview`
2. `POST /items/import/confirm`

Upsert behavior:

1. New normalized `sku_code` key -> create item
2. Existing normalized `sku_code` key -> update item

Normalization rules:
1. Lookup key is `UPPER(TRIM(sku_code))`.
2. `rm-0001`, `RM-0001`, and ` RM-0001 ` are treated as the same SKU key.

## Strict SKU Normalization and Duplicate Detection

Validation now applies in both preview and confirm phases:
1. Existing SKU matching is case-insensitive and whitespace-normalized.
2. Duplicate SKU rows in the same uploaded file are rejected even if case/spacing differs.
3. Duplicate errors include the first row number where the SKU key was seen.

## Strict Workflow-Mode Validation

During preview and confirm import:

1. Backend resolves tenant mode from `ops_workflow_mode`.
2. Backend reads CSV template marker (`template_workflow_mode`).
3. If signature markers are present, backend validates `template_signature`.
4. If mismatch, request is rejected.

Mismatch response includes:

1. `code: WORKFLOW_MODE_TEMPLATE_MISMATCH` (in validation details)
2. `template_workflow_mode`
3. `tenant_workflow_mode`
4. Remediation message instructing users to download the correct mode template.

## Common Errors

| Error | Meaning | Action |
|-------|---------|--------|
| `WORKFLOW_MODE_TEMPLATE_MISMATCH` | CSV template mode does not match tenant mode | Download the matching mode template and retry |
| `TEMPLATE_SIGNATURE_INVALID` | Signed template markers are missing or invalid | Download a fresh template and retry |
| `Duplicate SKU code in import file` | A normalized SKU key appears more than once in the uploaded CSV | Keep one row per SKU key and retry |
| `Category 'product' is not valid for Items template` | Category does not match detected template columns | Use the correct row/category schema |
| `product_type is required when category is "product"` | Product row missing `product_type` | Set `work_in_progress` or `finished_goods` |
| `default_sale_price is required for MSME items` | MSME non-draft row missing sale price | Provide `default_sale_price` |

## Notes

1. Legacy unmarked CSV files are treated as manufacturing-oriented for compatibility.
2. For mixed operational usage across tenants, always regenerate templates per tenant mode instead of reusing old files.
