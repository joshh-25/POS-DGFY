# Tenant audit module

This module exposes the read-only, tenant-scoped audit history used by the POS
Audit workspace. It reads the tenant `audit_logs` model only; landlord audit
tables remain reserved for platform administration. Controllers are transport
only, while filtering and serialization stay in the repository boundary.

Audit history is restricted server-side to tenant admins and master admins.
Audit entries must not contain passwords, tokens, PIN values, or other secrets.
