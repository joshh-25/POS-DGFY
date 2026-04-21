# RBAC Sensitive Action Matrix

Last updated: 2026-04-21

## Objective
Map sensitive compliance and POS operations to required permissions and enforcement surface.

| Sensitive Action | Permission / Role Gate | Backend Enforcement | Frontend Capability Surface |
|---|---|---|---|
| POS checkout | `pos:transact` | `backend/src/routes/pos.js`, `backend/src/modules/pos/controllers/posHandlers.js` | `frontend/src/features/pos/pages/TerminalPage.jsx` |
| Open terminal shift | `pos:transact` | `backend/src/routes/pos.js` (`/terminal/shifts/open`) | `frontend/src/features/pos/pages/TerminalPage.jsx` |
| Switch terminal shift location | `pos:switch_location` | `backend/src/routes/pos.js` (`/terminal/shifts/:id/switch-location`) | `frontend/src/features/pos/pages/TerminalPage.jsx` |
| Cash drawer adjustment | `pos:cash_drawer_adjust` | `backend/src/routes/pos.js` (`/terminal/shifts/:id/cash-events`) | `frontend/src/features/pos/pages/TerminalPage.jsx` |
| Close terminal shift / day | `pos:close_day` | `backend/src/routes/pos.js` (`/terminal/shifts/:id/close`, `/z-reading/close-day`) | `frontend/src/features/pos/pages/TerminalPage.jsx` |
| Compliance profile update | `system:edit_settings` | `backend/src/routes/compliance.js` (`PUT /profile`) | `frontend/src/features/compliance/components/ComplianceProgramPanel.jsx` |
| Compliance activation | `system:edit_settings` + master-admin level usecase actor check | `backend/src/routes/compliance.js` (`POST /activate`), `backend/src/modules/compliance/usecases/complianceUseCases.js` | `frontend/src/features/compliance/components/ComplianceProgramPanel.jsx` |
| Compliance revert to non-compliant | `system:edit_settings` + tenant master-admin usecase actor check | `backend/src/routes/compliance.js` (`POST /mode/revert-to-non-compliant`), `backend/src/modules/compliance/usecases/complianceUseCases.js` | `frontend/src/features/compliance/components/ComplianceProgramPanel.jsx` |
| Compliance force non-compliant (platform) | Platform admin auth (`authenticateAdmin`) + platform-admin usecase actor check | `backend/src/routes/adminTenants.js` (`POST /:id/force-non-compliant`), `backend/src/modules/compliance/usecases/complianceUseCases.js` | `frontend/Pages/admin/TenantManager.jsx` |
| Artifact/peripheral verification | Master-admin level actor (`tenant_master_admin` or `platform_admin`) | `backend/src/modules/compliance/usecases/complianceUseCases.js` | `frontend/Pages/admin/TenantManager.jsx` |
| Security incident acknowledge/resolve | Platform admin auth (`authenticateAdmin`) + master-admin level usecase actor check | `backend/src/routes/adminTenants.js` (`POST /:id/compliance/security-incidents/:incident_id/acknowledge`, `POST /:id/compliance/security-incidents/:incident_id/resolve`), `backend/src/modules/compliance/usecases/complianceUseCases.js` | `frontend/Pages/admin/TenantManager.jsx` |

## Verification References
- `backend/tests/complianceActivation.transport.test.js`
- `backend/tests/posHandlers.transport.test.js`
- `backend/tests/posValidator.terminalShiftIdentity.test.js`
- `backend/tests/complianceSecurityIncidents.usecase.test.js`
