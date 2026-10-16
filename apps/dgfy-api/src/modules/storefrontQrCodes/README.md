# Storefront QR Codes Module

Tenant-scoped QR code management for OPIS and public Storefront resolution.

Flow:

`routes -> QR code handlers -> QR code use-cases -> QR code repository -> StorefrontQrCode model`

Management requests use the authenticated OPIS tenant context, existing catalog
permissions, Business Admin access, and assigned branch scope. POS and IMS
capability flags do not authorize or block this module. Public resolution only
returns active codes and validates the requested branch when one is supplied.
