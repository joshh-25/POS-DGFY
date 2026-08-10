# Storefront Domains

Owns custom storefront hostnames at the landlord boundary. The module validates
exact DNS ownership and routing, manages one canonical hostname plus verified
aliases, queues durable edge-controller operations, resolves a serving host to
one tenant, monitors eligibility/DNS/TLS state, and records every lifecycle
change.

Tenant databases never own hostname routing. Runtime resolution is read-only and
only `active` or unexpired `eligibility_grace` records can establish Storefront
tenant context. Platform admins cannot directly activate a hostname; only a
trusted external controller report with health proof can complete provisioning.
