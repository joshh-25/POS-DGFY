# Partner identity

Platform-owned OIDC client registry and provider. The landlord tables `partner_apps` and
`oidc_clients` are defined by the migration runner and are intentionally excluded from tenant
model cloning. Registry clients expose `client_id`, `client_type`, `environment`, `status`,
`auth_method`, one-way `secret_hash` or client-held `public_key_pem`/`key_id`, `audience`, exact
`redirect_uris` and `post_logout_redirect_uris`, `allowed_scopes`, optional `context_adapter`, and
`secret_rotated_at`. App approval is represented by `partner_apps.status`. Credential lifecycle and
tenant attachments remain separately owned by #801/#802. Registry `secret_hash` values use the
one-way `scrypt$<salt>$<base64url-digest>` representation verified by the provider; plaintext
secrets are accepted only by the temporary DGLaundry environment adapter and are never persisted.
