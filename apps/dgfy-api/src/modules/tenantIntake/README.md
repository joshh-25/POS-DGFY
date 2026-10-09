# Tenant intake

Landlord proposals for admin-assisted OFFICIAL/DEMO account and tenant provisioning (#2372).
Routes → transport handlers → use cases → landlord repository. Extraction has no tools and creates
only a pending proposal; authenticated human confirmation consumes it once and calls the existing
tenants module. Proposal writes and Platform Admin audit events share transactions.

Contract: [Tenant intake API](../../../../../docs/api/tenant-intake.md).
