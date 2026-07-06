# Implementation Details — Local-Only Codex QA Skill & Guide

## Proposed File Changes

### Component: Codex QA Skill
#### [x] [MODIFY] [SKILL.md](file:///c:/xampp/htdocs/POS-DGFY/.codex/skills/web-performance-qa/SKILL.md)
- Update the skill definition to enforce strictly local testing on Skupervisor, POS, and Storefront apps. Remove any references to GitHub Actions or CI/CD pipelines.

#### [x] [MODIFY] [AGENTS.md](file:///c:/xampp/htdocs/POS-DGFY/AGENTS.md)
- Reference the local-only Codex skill at the bottom of the file as instructed.

### Component: Documentation Guides
#### [x] [NEW] [local-testing-guide.md](file:///c:/xampp/htdocs/POS-DGFY/docs/testing/local-testing-guide.md)
- Full documentation on running E2E tests, headed mode, Playwright UI, HTML reports, app-specific runs, security tests, Lighthouse audits, and k6 scripts strictly on localhost.

### Component: Bug Fixes
#### [MODIFY] [POSCheckoutTerminal.jsx](file:///c:/xampp/htdocs/POS-DGFY/frontend/src/features/pos/components/POSCheckoutTerminal.jsx)
- Import `ChevronLeft` and `ChevronRight` icons from `lucide-react` at the top of the file to fix the page rendering crash.


