# Partner identity

Platform-owned OIDC client registry, credential lifecycle, tenant attachments, and machine-token
context resolution. `partner_apps`, `oidc_clients`, `partner_client_credentials`, and
`partner_attachments` are landlord tables defined by the migration runner and excluded from tenant
model cloning. Credential versions are redacted from administration reads; a generated browser
secret is returned only by its one-time issue/rotation response, and the partner's private key is
never accepted or stored. Public-key versions are selected by `kid`; valid secret hashes are tried
during the bounded overlap window. Legacy registry columns remain a provider fallback only while a
client has no credential-version rows, preserving the #2311/DGLaundry baseline.

Platform lifecycle routes are mounted at `/api/v1/admin/partner-integrations` and require a live
`admin.partner_integrations` Platform Admin grant. Merchant attachment routes are mounted at
`/api/v1/partner-attachments`, require the authenticated tenant context and tenant admin authority,
and write attachment audit events in that tenant's `audit_logs`. Machine consumers use
`authenticatePartnerClient` and `requirePartnerScope`; the bearer token is reverse-indexed in Redis,
then client, app, attachment, tenant, and active location rows are revalidated for each request.
The tenant header is only a selector and is replaced with the server-resolved company token before
`tenantHandler` establishes tenant DB context. Partner identity never creates a cashier or staff
identity.
