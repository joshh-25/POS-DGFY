# Plan — Create local-only web-performance-qa Codex Skill & Guide

## 1) Objective
Establish the project-local Codex skill and accompanying guide for QA, performance, load, security, and cross-app communication testing in POS-DGFY, keeping all tests strictly local.

## 2) Proposed Tasks
- Update `.codex/skills/web-performance-qa/SKILL.md` to document the triggers, local-only rules, and three-app ports and architectures.
- Update `AGENTS.md` with the reference to use this local Codex skill.
- Create `docs/testing/local-testing-guide.md` documenting terminal runs, headed browser testing, Playwright UI, HTML reports, app-specific runs, and `npx playwright codegen` generation.
- Wait for user approval before writing these files.
- **Bug Fix**: Import `ChevronLeft` and `ChevronRight` icons in `POSCheckoutTerminal.jsx`.

## 3) Verification Plan
- [x] Confirm created files exist and contain local testing guidelines.
- [x] Confirm E2E smoke tests pass and verify no ReferenceErrors on POS page.
