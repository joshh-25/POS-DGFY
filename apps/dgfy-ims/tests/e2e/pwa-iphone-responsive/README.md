# PWA iPhone Responsive QA

This folder contains iPhone-only Playwright coverage for the POS PWA.

- Supported widths: 375px, 390px, and 430px.
- Tests must use local `test.use(...)` device settings.
- Do not add desktop or tablet assertions here.
- Production layout changes remain in the shared POS components and must be scoped with mobile-only breakpoints.
