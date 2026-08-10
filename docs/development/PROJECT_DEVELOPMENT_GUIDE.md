# PROJECT_DEVELOPMENT_GUIDE.md
## Universal Project Bootstrap Guide

> **Version:** 1.1.1
> **Audience:** Solo developers scaling to small teams (1-5 people)
> **Last Updated:** 2026-05-03

---

## Table of Contents

1. [Project Intent & Guardrails](#1-project-intent--guardrails)
   - [Context Discovery Questionnaire](#11-context-discovery-questionnaire)
   - [Project Charter](#12-project-charter)
2. [Repository Standards](#2-repository-standards)
   - [The Documentation-First Rule](#21-the-documentation-first-rule)
   - [File Structure Standard](#22-file-structure-standard)
   - [Repository Hygiene](#23-repository-hygiene)
   - [AI/ML Feature Documentation](#24-aiml-feature-documentation)
   - [Workflow Mode Development](#25-workflow-mode-development)
3. [Development Workflow](#3-development-workflow)
   - [Tier 1: Solo/Prototyping](#31-tier-1-soloprototyping)
   - [Tier 2: Team/Production](#32-tier-2-teamproduction)
   - [Project Management with GitHub Issues](#33-project-management-with-github-issues)
4. [Environment & Secrets](#4-environment--secrets)
   - [Environment Setup Workflow](#41-environment-setup-workflow)
   - [Security Rules for Secrets](#42-security-rules-for-secrets)
5. [Quality Assurance](#5-quality-assurance)
   - [Linting Configuration](#51-linting-configuration)
   - [Testing Pyramid](#52-testing-pyramid)
   - [The Clean Build Rule](#53-the-clean-build-rule)
6. [Security by Default](#6-security-by-default)
   - [SDLC Security Phases](#61-sdlc-security-phases)
   - [Dependency Management](#62-dependency-management)
   - [Secure Coding Practices](#63-secure-coding-practices)
7. [Operations & Reliability](#7-operations--reliability)
   - [Observability](#71-observability)
   - [Runbook Template](#72-runbook-template)
   - [Incident Response](#73-incident-response)
8. [Appendices](#8-appendices)
   - [A. Context Discovery Questionnaire (Full)](#appendix-a-context-discovery-questionnaire-full)
   - [B. README.md Stub](#appendix-b-readmemd-stub)
   - [C. ADR Template](#appendix-c-adr-template)
   - [D. Tier 1 vs Tier 2 Checklist](#appendix-d-tier-1-vs-tier-2-checklist)
   - [E. 5-Question Threat Model](#appendix-e-5-question-threat-model)
   - [F. CONTRIBUTING.md Template](#appendix-f-contributingmd-template)
   - [G. CHANGELOG.md Format](#appendix-g-changelogmd-format)
   - [H. GitHub Template Files](#appendix-h-github-template-files)

---

## 1. Project Intent & Guardrails

### Current SKUpervisor Overlay

This guide is a general bootstrap reference plus project-specific guardrails. For this repository, always start implementation planning from `docs/START_HERE.md`, then `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, relevant ADRs, and the domain docs for the surface you are changing.

Current project-specific development notes:
- Hosting profiles are env-selected from one codebase: `shared` and `vps` are documented in `docs/ops/HOSTING_PROFILES.md`.
- Use `backend/.env.example` for local development, `backend/.env.shared.example` for shared hosting, and `backend/.env.vps.example` for Redis-capable hosting. Frontend hosting templates live under `apps/dgfy-web/.env.shared.example` and `apps/dgfy-web/.env.vps.example`.
- Public company registration is mandatory manual review. Submission creates a pending application and applicant status route; only Platform Admin approval may provision and activate the tenant.
- Keep `RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS` and `RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS` strict because public registration writes landlord review state and queues later provisioning.
- Payments remain disabled by default with `PAYMENTS_ENABLED=false`; premium/subscription registration and payment routes must keep returning the disabled contract unless payments are intentionally re-enabled.

### 1.1 Context Discovery Questionnaire

> **RULE: No code is written until the Questionnaire is filled.**

Before writing a single line of code, answer these 10 questions. This prevents scope creep, clarifies requirements, and establishes guardrails. Copy this questionnaire to your project's root or `docs/` folder.

| # | Category | Question |
|---|----------|----------|
| 1 | **Scope** | What is the ONE-SENTENCE purpose of this project? |
| 2 | **Scope** | What are the 3-5 core features that MUST be delivered? |
| 3 | **Users** | Who is the primary user? (Role, technical level) |
| 4 | **Users** | What is the expected user volume? (1-10, 10-100, 100-1000, 1000+) |
| 5 | **Risks** | What is the biggest technical risk? (New tech, integration, scale) |
| 6 | **Risks** | What happens if the system goes down for 1 hour? (Impact level) |
| 7 | **Data** | What sensitive data will be stored? (PII, credentials, financial) |
| 8 | **Data** | What are the data retention requirements? (Days, months, years) |
| 9 | **Constraints** | What is the deployment environment? (Cloud, on-prem, hybrid) |
| 10 | **Constraints** | What is the team size and experience level? |

**Full questionnaire template:** [Appendix A](#appendix-a-context-discovery-questionnaire-full)

### 1.2 Project Charter

After completing the questionnaire, create a `PROJECT_CHARTER.md` (or add to your main README) containing:

#### Minimum Required
- One-sentence project description
- List of core features
- Primary user persona
- Key constraints

#### Recommended
- Success metrics (measurable outcomes)
- Out-of-scope items (explicit exclusions)
- Key stakeholders
- Communication channels

---

## 2. Repository Standards

### 2.1 The Documentation-First Rule

> **RULE: Feature → Doc Update → Implementation**

Documentation is the single source of truth. Code must align with documentation, not the other way around.

#### Minimum Required
- `README.md` in root with setup instructions
- Code comments for non-obvious logic
- API endpoint documentation

#### Recommended
- Dedicated `docs/` folder with structured documentation
- Architecture Decision Records (ADRs)
- CHANGELOG.md for version history
- CONTRIBUTING.md for external contributors

**Gold Standard Example:** This project's `docs/` folder structure:
```
docs/
├── INDEX.md                    # Documentation hub
├── README.md                   # Documentation principles
├── architecture/               # System architecture & diagrams
│   └── system-architecture.md
├── database/                   # Database schema & design
│   └── schema.md
├── api/                        # API specifications
│   ├── specification.md
│   └── integration-guide.md
├── development/                # Development guides
│   ├── roadmap.md
│   ├── guidelines.md
│   └── environment-setup.md
├── guides/                     # User guides
│   ├── SCRIPTS_GUIDE.md
│   └── DELETE_ARCHIVE_GUIDE.md
├── ops/                        # Operations
│   ├── DEPLOYMENT_GUIDE.md
│   └── TROUBLESHOOTING.md
└── setup/                      # Setup instructions
    ├── QUICK_START.md
    └── PREREQUISITES.md
```

See [docs/README.md](docs/README.md) for the authoritative documentation principles.

### 2.2 File Structure Standard

#### Minimum Required
```
project-root/
├── README.md                   # Project overview
├── .gitignore                  # Git ignore rules
├── package.json                # Dependencies (Node.js)
│   └── (or requirements.txt)  # (Python)
├── src/                        # Source code
│   └── (or frontend/, backend/)
└── tests/                      # Test files
```

#### Recommended (Monorepo)
```
project-root/
├── README.md                   # Project overview
├── CLAUDE.md                   # AI assistant context
├── PROJECT_CHARTER.md          # Project guardrails
├── .github/
│   └── workflows/              # CI/CD pipelines
├── docs/                       # Documentation
│   ├── INDEX.md
│   ├── api/
│   ├── architecture/
│   └── database/
├── frontend/                   # Frontend application
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── backend/                    # Backend application
│   ├── src/
│   ├── package.json
│   └── .env.example
└── docker-compose.yml          # Container orchestration
```

### 2.3 Repository Hygiene

#### Minimum Required

**.gitignore** — Never commit these:
```gitignore
# Dependencies
node_modules/
__pycache__/
venv/

# Environment (CRITICAL)
.env
.env.local
.env.*.local

# Build outputs
dist/
build/
*.pyc

# IDE
.vscode/
.idea/

# OS files
.DS_Store
Thumbs.db

# Logs
*.log
logs/
```

#### Recommended

**.editorconfig** — Consistent formatting across editors:
```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[*.py]
indent_size = 4
```

**Pre-commit hooks** — Automate quality checks:
```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.4.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
```

### 2.4 AI/ML Feature Documentation

> **RULE: AI capabilities must be documented from a single source of truth**

When integrating AI/ML features (chatbots, tool-calling assistants, AI agents), documentation drift is a significant risk. Tool definitions, system prompts, and user-facing documentation can easily become inconsistent.

#### The Problem

AI features typically require maintaining consistency across multiple files:
- **Tool definitions** (what the AI can do)
- **Tool handlers** (implementations of those tools)
- **System prompts** (instructions to the AI)
- **User documentation** (explaining capabilities to users)

Without automation, adding a new AI tool requires editing 3-4 files. Missing any file → documentation drift.

#### The Solution: Documentation Sync System

```
┌─────────────────────────────────────────────────────────────┐
│                    SOURCE OF TRUTH                          │
│                   (Tool Definitions)                        │
│                                                             │
│   Example: aiTools.js exports AI_TOOLS array                │
│   Each tool has: name, description, parameters, category    │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
┌───────────┐ ┌───────────┐ ┌───────────┐
│ Validation│ │  Doc Gen  │ │  System   │
│  Script   │ │  Script   │ │  Prompt   │
└─────┬─────┘ └─────┬─────┘ └─────┬─────┘
      │             │             │
      ▼             ▼             ▼
┌───────────┐ ┌───────────┐ ┌───────────┐
│ CI/Hook   │ │ Generated │ │ Dynamic   │
│ Errors    │ │ Docs      │ │ Tool List │
└───────────┘ └───────────┘ └───────────┘
```

#### Minimum Required

1. **Single Source of Truth File**
   - One file defines all AI tools/capabilities
   - Include metadata: name, description, parameters, category, permissions

2. **Validation Script**
   - Verify every defined tool has a handler implementation
   - Check required metadata is present
   - Exit with error code for CI/hooks

3. **Pre-commit Hook**
   - Run validation when AI-related files change
   - Block commits that break tool/handler consistency

#### Recommended

1. **Documentation Generator Script**
   - Read tool definitions programmatically
   - Generate markdown tables automatically
   - Output to `docs/generated/` directory

2. **Dynamic System Prompt**
   - Import tool counts from source of truth
   - Auto-list capabilities instead of hardcoding

3. **Test Suite for AI Tools**
   - Test every tool has matching handler
   - Test all parameters have descriptions
   - Test category/permission metadata is valid

#### Implementation Template

**Validation Script (`backend/scripts/validate-ai-tools.js`):**
```javascript
#!/usr/bin/env node
/**
 * AI Tools Validation Script
 * Ensures tool definitions match handlers
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import your tool definitions
import { AI_TOOLS } from '../src/config/aiTools.js';

// Read the executor file that contains handlers
const executorPath = path.join(__dirname, '../src/services/aiToolExecutor.js');
const executorContent = fs.readFileSync(executorPath, 'utf8');

let errors = [];
let warnings = [];

// Check each tool has a handler
for (const tool of AI_TOOLS) {
  const toolName = tool.function?.name;
  if (!toolName) {
    errors.push(`Tool missing function.name`);
    continue;
  }

  // Look for case statement in switch
  const casePattern = new RegExp(`case\\s+['"]${toolName}['"]\\s*:`);
  if (!casePattern.test(executorContent)) {
    errors.push(`Missing handler for tool: ${toolName}`);
  }

  // Check required fields
  if (!tool.function?.description) {
    errors.push(`Tool ${toolName} missing description`);
  }
  if (!tool.category) {
    warnings.push(`Tool ${toolName} missing category`);
  }
}

// Report results
console.log(`\n📊 AI Tools Validation Report`);
console.log(`   Total tools: ${AI_TOOLS.length}`);

if (errors.length > 0) {
  console.log(`\n❌ ERRORS (${errors.length}):`);
  errors.forEach(e => console.log(`   - ${e}`));
}

if (warnings.length > 0) {
  console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
  warnings.forEach(w => console.log(`   - ${w}`));
}

if (errors.length === 0) {
  console.log(`\n✅ All tools validated successfully!`);
  process.exit(0);
} else {
  console.log(`\n❌ Validation failed. Fix errors before committing.`);
  process.exit(1);
}
```

**Documentation Generator (`backend/scripts/generate-ai-docs.js`):**
```javascript
#!/usr/bin/env node
/**
 * AI Documentation Generator
 * Auto-generates capability docs from tool definitions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { AI_TOOLS, TOOL_CATEGORIES } from '../src/config/aiTools.js';

// Group tools by category
const toolsByCategory = {};
for (const tool of AI_TOOLS) {
  const cat = tool.category || 'other';
  if (!toolsByCategory[cat]) toolsByCategory[cat] = [];
  toolsByCategory[cat].push(tool);
}

// Generate markdown
let markdown = `# AI Capabilities Reference

> **Auto-generated** - Do not edit manually
> **Generated:** ${new Date().toISOString()}
> **Total Tools:** ${AI_TOOLS.length}

`;

// Add table for each category
for (const [category, tools] of Object.entries(toolsByCategory)) {
  markdown += `## ${category.charAt(0).toUpperCase() + category.slice(1)} Operations\n\n`;
  markdown += `| Tool | Description | Confirmation |\n`;
  markdown += `|------|-------------|-------------|\n`;

  for (const tool of tools) {
    const name = tool.function?.name || 'unknown';
    const desc = tool.function?.description?.split('.')[0] || '';
    const confirm = tool.requiresConfirmation ? 'Yes' : 'No';
    markdown += `| \`${name}\` | ${desc} | ${confirm} |\n`;
  }
  markdown += '\n';
}

// Write to file
const outputPath = path.join(__dirname, '../docs/generated/AI_CAPABILITIES.md');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, markdown);

console.log(`✅ Generated: ${outputPath}`);
console.log(`   Tools documented: ${AI_TOOLS.length}`);
```

**Pre-commit Hook (`.husky/pre-commit`):**
```bash
#!/bin/sh

# Check if any AI-related files are staged
AI_FILES=$(git diff --cached --name-only | grep -E "(aiTools|aiToolExecutor|aiSystemPrompt)" || true)

if [ -n "$AI_FILES" ]; then
  echo "📋 AI-related files changed. Running validation..."

  # Run validation
  cd backend && npm run validate:ai

  if [ $? -ne 0 ]; then
    echo "❌ AI validation failed. Please fix errors before committing."
    exit 1
  fi

  echo "✅ AI validation passed!"
fi
```

**Package.json Scripts:**
```json
{
  "scripts": {
    "validate:ai": "cd backend && node scripts/validate-ai-tools.js",
    "generate:ai-docs": "cd backend && node scripts/generate-ai-docs.js",
    "ai:check": "npm run validate:ai && npm run generate:ai-docs"
  }
}
```

**Test Suite (`tests/aiTools.test.js`):**
```javascript
import { AI_TOOLS, TOOL_CATEGORIES } from '../src/config/aiTools.js';
import fs from 'fs';
import path from 'path';

describe('AI Tools Configuration', () => {
  test('every tool should have a unique name', () => {
    const names = AI_TOOLS.map(t => t.function?.name).filter(Boolean);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  test('every tool should have required fields', () => {
    for (const tool of AI_TOOLS) {
      expect(tool.function).toHaveProperty('name');
      expect(tool.function).toHaveProperty('description');
      expect(tool.function.description.length).toBeGreaterThan(10);
    }
  });

  test('every defined tool should have a handler', () => {
    const executorPath = path.join(__dirname, '../src/services/aiToolExecutor.js');
    const executorContent = fs.readFileSync(executorPath, 'utf8');

    const missingHandlers = [];
    for (const tool of AI_TOOLS) {
      const toolName = tool.function.name;
      const casePattern = new RegExp(`case\\s+['"]${toolName}['"]\\s*:`);
      if (!casePattern.test(executorContent)) {
        missingHandlers.push(toolName);
      }
    }

    expect(missingHandlers).toHaveLength(0);
  });
});
```

#### Gold Standard Example

This project's AI documentation sync system demonstrates this pattern:

| Component | File |
|-----------|------|
| Source of Truth | `backend/src/config/aiTools.js` |
| Tool Registry | `backend/src/config/aiToolRegistry.js` |
| Validation Script | `backend/scripts/validate-ai-tools.js` |
| Doc Generator | `backend/scripts/generate-ai-docs.js` |
| Generated Docs | `docs/generated/AI_CAPABILITIES.md` |
| Test Suite | `backend/tests/aiTools.test.js` |
| Pre-commit Hook | `.husky/pre-commit` |

**Usage:**
```bash
# Validate tool consistency
npm run validate:ai

# Generate documentation
npm run generate:ai-docs

# Both (recommended before commits)
npm run ai:check
```

See [docs/ai/AI_GUIDELINES.md](docs/ai/AI_GUIDELINES.md) for user-facing documentation and [docs/generated/AI_CAPABILITIES.md](docs/generated/AI_CAPABILITIES.md) for the auto-generated tool reference.

---

### 2.5 Workflow Mode Development

When tailoring a tenant workflow mode, use [MODE_DEVELOPMENT_PLAYBOOK.md](./MODE_DEVELOPMENT_PLAYBOOK.md) after the mandatory architecture lookup order. Each mode must become native to its business workflow across IMS, POS, Storefront, backend route guards, data contracts, tests, and documentation.

Services Mode is the current reference implementation for this pattern. It includes service catalog metadata, booking lifecycle, provider/resource assignments, waitlist preferences, intake response capture, reminder outbox processing, client retention/no-show signals, stock-exempt POS service sales, and mode-native IMS/POS/Storefront surfaces.

---

## 3. Development Workflow

### 3.1 Tier 1: Solo/Prototyping

For solo developers or early prototyping phases where speed is prioritized over process.

#### Minimum Required
- Direct commits to `main` allowed **IF** linting passes
- Self-Review Checklist before each commit:
  - [ ] Did I update documentation?
  - [ ] Did I add/update tests?
  - [ ] Did I run the linter?
  - [ ] Did I test the change locally?
- Descriptive commit messages

#### Recommended
- Use feature branches even when solo (creates history)
- Tag releases with semantic versioning
- Weekly self-code-review of recent changes

**Commit Message Format:**
```
<type>(<scope>): <description>

Types: feat, fix, docs, style, refactor, test, chore
Example: feat(auth): add JWT refresh token support
```

### 3.2 Tier 2: Team/Production

For teams or production-ready code where stability and collaboration are critical.

#### Minimum Required
- Pull Request (PR) workflow required
- 1 approval minimum before merge
- Linear git history (squash or rebase)
- Protected `main` branch
- CI must pass before merge

#### Recommended
- PR template with checklist
- Required PR sections: Summary, Test Plan, Screenshots (if UI)
- Conventional commits enforced
- Semantic versioning with CHANGELOG
- Code owners file for review routing

**PR Template:**
```markdown
## Summary
<!-- What does this PR do? -->

## Test Plan
<!-- How was this tested? -->

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Self-reviewed the diff
```

**Branch Naming Convention:**
```
feature/ABC-123-add-user-auth
bugfix/ABC-456-fix-login-error
hotfix/ABC-789-security-patch
docs/ABC-101-update-readme
```

### 3.3 Project Management with GitHub Issues

#### Minimum Required
- Use Issues for all non-trivial work
- Basic labels: `bug`, `enhancement`, `documentation`

#### Recommended

**Label System:**
| Category | Labels | Color |
|----------|--------|-------|
| Type | `bug`, `enhancement`, `documentation`, `question` | Red, Blue, Green, Purple |
| Priority | `P0-critical`, `P1-high`, `P2-medium`, `P3-low` | Dark Red to Light Gray |
| Status | `needs-triage`, `in-progress`, `blocked`, `ready-for-review` | Yellow tones |
| Component | `frontend`, `backend`, `database`, `infra` | Cyan tones |

**Milestones:**
- Group issues by release or sprint
- Set due dates for accountability
- Track completion percentage

**Issue Template:**
```markdown
## Description
<!-- Clear description of the issue or feature -->

## Steps to Reproduce (for bugs)
1. Step one
2. Step two
3. Expected: X, Actual: Y

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Technical Notes
<!-- Implementation hints, related files, etc. -->
```

---

## 4. Environment & Secrets

### 4.1 Environment Setup Workflow

#### Minimum Required

**Step 1:** Copy the example file
```bash
cp .env.example .env
```

**Step 2:** Edit `.env` with actual values
```bash
# Use your preferred editor
code .env  # or vim .env
```

**Step 3:** Never commit `.env`
Verify it's in `.gitignore`.

#### Recommended

**`.env.example` Template (Node.js):**
```bash
# Application
NODE_ENV=development
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=myapp_dev
DB_USER=root
DB_PASSWORD=CHANGE_ME

# Authentication
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=CHANGE_THIS_TO_32_CHAR_SECRET
JWT_EXPIRY=24h

# External Services (Optional)
REDIS_URL=redis://localhost:6379
```

**`.env.example` Template (Python/FastAPI):**
```bash
# Application
ENVIRONMENT=development
DEBUG=true
PORT=8000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/myapp_dev

# Authentication
SECRET_KEY=CHANGE_THIS_TO_32_CHAR_SECRET
ACCESS_TOKEN_EXPIRE_MINUTES=30

# External Services (Optional)
REDIS_URL=redis://localhost:6379
```

This project's current env templates:
- [backend/.env.example](../../backend/.env.example)
- [backend/.env.shared.example](../../backend/.env.shared.example)
- [backend/.env.vps.example](../../backend/.env.vps.example)
- [apps/dgfy-web/.env.shared.example](../../apps/dgfy-web/.env.shared.example)
- [apps/dgfy-web/.env.vps.example](../../apps/dgfy-web/.env.vps.example)

Current registration and hosting controls to keep synchronized with docs:
```bash
PAYMENTS_ENABLED=false
TENANT_REGISTRATION_APPROVAL_MODE=manual
RATE_LIMIT_DGFY_TENANT_SESSION_WINDOW_MS=900000
RATE_LIMIT_DGFY_TENANT_SESSION_MAX_REQUESTS=10
RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS=3600000
RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS=5
HOSTING_PROFILE=shared # or vps
AUTH_BLACKLIST_FAILURE_MODE=fail_open # shared
TEMP_FILE_STORAGE=local # shared
```

### 4.2 Security Rules for Secrets

#### Minimum Required

> **RULE: Never commit `.env` files**

- `.env` must be in `.gitignore`
- Review git history for accidental commits
- Rotate secrets if exposed

#### Recommended

**Secrets Scanner:**
```bash
# Install git-secrets
brew install git-secrets  # macOS
# or
pip install detect-secrets

# Initialize in repo
git secrets --install
git secrets --register-aws  # AWS credential patterns
```

**Environment Separation:**
```
.env.development    # Local development
.env.test           # Test environment
.env.qa.local       # QA gate inputs for no-staging release checks
.env.production     # Production (NEVER commit)
```

**Secret Rotation Policy:**
- Rotate all secrets every 90 days
- Rotate immediately if team member leaves
- Rotate immediately if potential exposure

---

## 5. Quality Assurance

### 5.1 Linting Configuration

#### Minimum Required

**ESLint (React/Node.js):**
```json
{
  "extends": [
    "eslint:recommended"
  ],
  "env": {
    "node": true,
    "es2021": true
  },
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "warn"
  }
}
```

**Run linting:**
```bash
npm run lint       # Check for issues
npm run lint:fix   # Auto-fix issues
```

#### Recommended

**ESLint with React Hooks:**
```json
{
  "extends": [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended"
  ],
  "plugins": ["react", "react-hooks"],
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  }
}
```

**Python (ruff or flake8):**
```toml
# pyproject.toml
[tool.ruff]
line-length = 100
select = ["E", "F", "W", "I"]
ignore = ["E501"]  # Line length handled separately
```

#### Code Formatting with Prettier

Prettier handles code formatting so developers don't argue about style.

**Minimum Required:**
```json
{
  "semi": true,
  "singleQuote": true
}
```

**Recommended (.prettierrc):**
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "avoid"
}
```

**.prettierignore:**
```
node_modules/
dist/
build/
coverage/
*.min.js
package-lock.json
```

**Integration with ESLint:**
```bash
npm install --save-dev eslint-config-prettier eslint-plugin-prettier
```

```json
// .eslintrc.json - add to extends
{
  "extends": [
    "eslint:recommended",
    "plugin:prettier/recommended"  // Must be last
  ]
}
```

**Run formatting:**
```bash
npm run format        # Format all files
npm run format:check  # Check without modifying (for CI)
```

**package.json scripts:**
```json
{
  "scripts": {
    "format": "prettier --write \"src/**/*.{js,jsx,ts,tsx,json,css,md}\"",
    "format:check": "prettier --check \"src/**/*.{js,jsx,ts,tsx,json,css,md}\""
  }
}
```

See this project's guidelines: [docs/development/guidelines.md](docs/development/guidelines.md)

### 5.2 Testing Pyramid

> **RULE: Unit > Integration > E2E**

More unit tests (fast, focused), fewer E2E tests (slow, brittle).

```
        /\
       /  \      E2E Tests (10%)
      /----\     - Complete user workflows
     /      \    - Use staging environment
    /--------\   Integration Tests (20%)
   /          \  - API endpoints
  /------------\ - Database interactions
 /              \Unit Tests (70%)
/----------------\- Service methods
                  - Pure functions
                  - Mocked dependencies
```

#### Minimum Required
- Unit tests for critical business logic
- Run tests before committing

#### Recommended

**Test Commands:**
```bash
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
npm run test:e2e          # E2E tests
```

**Coverage Targets:**
| Type | Target |
|------|--------|
| Unit Tests | 80%+ coverage |
| Integration Tests | Critical paths covered |
| E2E Tests | Happy paths covered |

**Test File Structure:**
```
tests/
├── unit/
│   ├── services/
│   │   └── itemService.test.js
│   └── utils/
│       └── validators.test.js
├── integration/
│   ├── routes/
│   │   └── items.test.js
│   └── database/
│       └── migrations.test.js
└── e2e/
    └── workflows/
        └── purchase-order.test.js
```

### 5.3 The Clean Build Rule

> **RULE: CI must pass before merging/deploying**

#### Minimum Required
- Linting passes
- All tests pass
- Build completes without errors

#### Recommended
- Type checking passes (TypeScript)
- Security audit passes
- Coverage thresholds met
- Bundle size within limits

**CI Pipeline Example (GitHub Actions):**
```yaml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
```

See this project's CI: [.github/workflows/ci.yml](.github/workflows/ci.yml)

---

## 6. Security by Default

### 6.1 SDLC Security Phases

#### Design Phase (Threat Model)

> **Before writing code, answer the 5-Question Threat Model**

See [Appendix E](#appendix-e-5-question-threat-model) for the full template.

Quick version:
1. What are we building?
2. What can go wrong?
3. What are we going to do about it?
4. Did we do a good job?
5. What's left?

#### Develop Phase (Secure Coding)

##### Minimum Required
- Input validation on all user inputs
- Parameterized queries (no SQL concatenation)
- Output encoding for XSS prevention
- Authentication on protected routes

##### Recommended
- OWASP Top 10 awareness
- Security linting rules
- Dependency vulnerability scanning
- Secret detection in CI

**Common Vulnerabilities to Prevent:**
| Vulnerability | Prevention |
|---------------|------------|
| SQL Injection | Parameterized queries, ORM |
| XSS | Output encoding, CSP headers |
| CSRF | CSRF tokens, SameSite cookies |
| Authentication bypass | JWT validation, session management |
| Sensitive data exposure | Encryption, proper headers |

#### Deploy Phase (Verify Configs)

##### Minimum Required
- HTTPS enabled
- Security headers set
- Debug mode disabled
- Default credentials changed

##### Recommended
- Security headers checklist:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security`
- Rate limiting enabled
- Audit logging enabled

See this project's security checklist: [docs/development/guidelines.md#security-checklist](docs/development/guidelines.md#security-checklist)

### 6.2 Dependency Management

#### Minimum Required

**Audit regularly:**
```bash
# Node.js
npm audit
npm audit fix

# Python
pip-audit
safety check
```

**Lockfile pinning:**
- Commit `package-lock.json` (Node.js)
- Commit `requirements.txt` with versions (Python)
- Use `npm ci` in CI (respects lockfile)

#### Recommended

**Automated dependency updates:**
- Dependabot or Renovate for automated PRs
- Review and test before merging

**Dependency review policy:**
- Evaluate new dependencies for:
  - Maintenance status (last commit, open issues)
  - Security history
  - License compatibility
  - Bundle size impact

### 6.3 Secure Coding Practices

#### Input Validation

**Node.js (Joi):**
```javascript
const Joi = require('joi');

const userSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().max(100).required()
});

// Validate
const { error, value } = userSchema.validate(req.body);
if (error) {
  return res.status(400).json({ error: error.details[0].message });
}
```

**Python (Pydantic):**
```python
from pydantic import BaseModel, EmailStr
from typing import Optional

class UserCreate(BaseModel):
    email: EmailStr
    password: str  # Min length validated in validator
    name: str

    class Config:
        min_anystr_length = 1
        max_anystr_length = 100
```

#### Authentication

**JWT Best Practices:**
- Use strong secrets (32+ characters)
- Set reasonable expiry (15-60 minutes for access tokens)
- Implement refresh token rotation
- Store tokens securely (httpOnly cookies or secure storage)

---

## 7. Operations & Reliability

### 7.1 Observability

#### Minimum Required
- Application logs to stdout/file
- Error logging with stack traces
- Basic health check endpoint

#### Recommended

**Structured Logging (JSON):**
```javascript
// Good: Structured JSON logging
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'app.log' })
  ]
});

// Usage
logger.info('User login', {
  userId: user.id,
  ip: req.ip,
  userAgent: req.headers['user-agent']
});
```

```javascript
// Bad: Unstructured console.log
console.log('User ' + user.id + ' logged in from ' + req.ip);
```

**Log Levels:**
| Level | Usage |
|-------|-------|
| `error` | Critical failures requiring immediate attention |
| `warn` | Unexpected but recoverable situations |
| `info` | Normal application flow (requests, business events) |
| `debug` | Detailed debugging (disabled in production) |

**Metrics to Track:**
- Request latency (p50, p95, p99)
- Error rate
- Throughput (requests/second)
- Database query times
- Memory/CPU usage

### 7.2 Runbook Template

Create runbooks in `docs/ops/runbooks/` for common operational scenarios.

```markdown
# Runbook: [Service Name] Failure

## Summary
What this runbook addresses.

## Symptoms
- [ ] Symptom 1 (e.g., API returns 5XX)
- [ ] Symptom 2 (e.g., High CPU usage)

## Immediate Actions
1. Step one
2. Step two
3. Step three

## Investigation Steps
1. Check logs: `pm2 logs`
2. Check metrics dashboard
3. Check recent deployments

## Resolution
- If cause A → do X
- If cause B → do Y

## Escalation
- If unresolved after 15 minutes, contact [Person/Team]

## Post-Incident
- [ ] Document timeline
- [ ] Identify root cause
- [ ] Create follow-up tasks
```

### 7.3 Incident Response

#### Minimum Required
- Know how to restart services
- Know how to rollback deployments
- Have contact list for escalation

#### Recommended

**Incident Severity Levels:**
| Severity | Definition | Response |
|----------|------------|----------|
| SEV1 | Complete outage | All hands, immediate |
| SEV2 | Major feature broken | On-call responds within 15 min |
| SEV3 | Minor feature broken | Next business day |
| SEV4 | Cosmetic issue | Sprint backlog |

**Rollback Procedure:**
```bash
# 1. Revert to previous deployment
git reset --hard HEAD^

# 2. Rebuild
npm run build

# 3. Restart services
pm2 restart all

# 4. Verify
curl https://your-app.com/health
```

See this project's deployment checklist: [docs/ops/PRODUCTION_CHECKLIST.md](docs/ops/PRODUCTION_CHECKLIST.md)

---

## 8. Appendices

### Appendix A: Context Discovery Questionnaire (Full)

Copy this to your project and fill it out before starting development.

```markdown
# Context Discovery Questionnaire

## Project Information
**Project Name:** ________________________________
**Date:** ________________________________
**Author:** ________________________________

---

## 1. SCOPE

### 1.1 One-Sentence Purpose
What is the ONE-SENTENCE purpose of this project?

> _[Your answer here]_

### 1.2 Core Features
What are the 3-5 core features that MUST be delivered?

1. _[Feature 1]_
2. _[Feature 2]_
3. _[Feature 3]_
4. _[Feature 4 - optional]_
5. _[Feature 5 - optional]_

### 1.3 Out of Scope
What is explicitly OUT of scope for this project?

- _[Exclusion 1]_
- _[Exclusion 2]_
- _[Exclusion 3]_

---

## 2. USERS

### 2.1 Primary User
Who is the primary user?

| Attribute | Value |
|-----------|-------|
| Role | _[e.g., Warehouse Manager]_ |
| Technical Level | _[Non-technical / Somewhat technical / Technical]_ |
| Frequency of Use | _[Daily / Weekly / Monthly]_ |

### 2.2 User Volume
What is the expected user volume?

- [ ] 1-10 users (Solo/Small team)
- [ ] 10-100 users (Small business)
- [ ] 100-1000 users (Medium business)
- [ ] 1000+ users (Enterprise/Public)

### 2.3 Secondary Users
Are there other user types?

| User Type | Permissions | Notes |
|-----------|-------------|-------|
| _[Admin]_ | _[Full access]_ | _[...]_ |
| _[Viewer]_ | _[Read-only]_ | _[...]_ |

---

## 3. RISKS

### 3.1 Technical Risks
What is the biggest technical risk?

- [ ] New/unfamiliar technology
- [ ] Complex integrations
- [ ] Scale/performance requirements
- [ ] Security requirements
- [ ] Other: ________________________________

**Details:**
> _[Explain the risk and mitigation strategy]_

### 3.2 Downtime Impact
What happens if the system goes down for 1 hour?

- [ ] Critical: Business stops, revenue loss
- [ ] High: Major disruption, workarounds needed
- [ ] Medium: Some impact, can wait
- [ ] Low: Minimal impact, inconvenience only

---

## 4. DATA

### 4.1 Sensitive Data
What sensitive data will be stored?

- [ ] PII (names, emails, addresses)
- [ ] Authentication credentials
- [ ] Financial data
- [ ] Health information
- [ ] None
- [ ] Other: ________________________________

**Compliance Requirements:**
> _[GDPR, HIPAA, PCI-DSS, etc.]_

### 4.2 Data Retention
What are the data retention requirements?

| Data Type | Retention Period | Deletion Policy |
|-----------|------------------|-----------------|
| _[User data]_ | _[3 years]_ | _[Soft delete]_ |
| _[Logs]_ | _[90 days]_ | _[Auto-purge]_ |

---

## 5. CONSTRAINTS

### 5.1 Deployment Environment
Where will this be deployed?

- [ ] Cloud (AWS, GCP, Azure)
- [ ] On-premises
- [ ] Hybrid
- [ ] Local only (development/demo)

**Specific Platform:** ________________________________

### 5.2 Team
What is the team composition?

| Attribute | Value |
|-----------|-------|
| Team Size | _[1-5]_ |
| Experience Level | _[Junior / Mid / Senior]_ |
| Available Hours/Week | _[...]_ |

### 5.3 Budget Constraints
Any budget constraints to consider?

> _[e.g., Must use free tier services, existing licenses only]_

---

## Sign-off

By completing this questionnaire, I confirm that the scope and requirements are understood.

**Signed:** ________________________________
**Date:** ________________________________
```

---

### Appendix B: README.md Stub

```markdown
# Project Name

> One-sentence description of what this project does.

## Quick Start

### Prerequisites
- Node.js 18+
- MySQL 8.0
- (Optional) Redis

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/your-project.git
cd your-project

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

## Documentation

- [Setup Guide](docs/setup/SETUP.md)
- [API Specification](docs/api/specification.md)
- [Architecture](docs/architecture/system-architecture.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) / [Your License]
```

---

### Appendix C: ADR Template

Architecture Decision Records document significant technical decisions.

```markdown
# ADR-001: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Context
What is the issue that we're seeing that is motivating this decision or change?

## Decision
What is the change that we're proposing and/or doing?

## Consequences

### Positive
- Benefit 1
- Benefit 2

### Negative
- Drawback 1
- Drawback 2

### Neutral
- Side effect 1

## Alternatives Considered

### Option A: [Name]
**Description:** ...
**Pros:** ...
**Cons:** ...

### Option B: [Name]
**Description:** ...
**Pros:** ...
**Cons:** ...

## References
- [Link to relevant documentation]
- [Link to discussion]
```

**ADR Storage:** `docs/decisions/` or `docs/adr/`

---

### Appendix D: Tier 1 vs Tier 2 Checklist

Use this to determine which workflow tier applies to your current situation.

| Criterion | Tier 1 (Solo) | Tier 2 (Team) |
|-----------|---------------|---------------|
| Team size | 1 person | 2+ people |
| Project phase | Prototyping | Production |
| User impact | Low | Medium-High |
| Compliance needs | None | Any |
| Code ownership | Single | Shared |

**Tier 1 Pre-Commit Checklist:**
- [ ] Linter passes (`npm run lint`)
- [ ] Tests pass (`npm test`)
- [ ] I manually tested the change
- [ ] I updated relevant documentation
- [ ] Commit message is descriptive

**Tier 2 PR Checklist:**
- [ ] All Tier 1 items
- [ ] PR description explains the "why"
- [ ] Test plan documented
- [ ] Screenshots (if UI change)
- [ ] No TODO comments without linked issues
- [ ] CI pipeline passes
- [ ] Code review requested

---

### Appendix E: 5-Question Threat Model

A lightweight threat modeling approach for small teams.

```markdown
# Threat Model: [Feature/System Name]

## 1. What are we building?
Describe the system, its components, and data flows.

**Components:**
- [ ] Web frontend
- [ ] API backend
- [ ] Database
- [ ] External integrations

**Data Flows:**
- User → Frontend → API → Database
- External Service → API

## 2. What can go wrong?

### Authentication/Authorization
- [ ] Can users access other users' data?
- [ ] Can unauthenticated users access protected resources?
- [ ] Are admin functions properly protected?

### Data
- [ ] Can data be tampered with?
- [ ] Can sensitive data be leaked?
- [ ] Is data validated before use?

### Availability
- [ ] Can the system be crashed?
- [ ] Can it be overloaded (DoS)?
- [ ] Are there single points of failure?

### External Dependencies
- [ ] What if third-party services are compromised?
- [ ] What if dependencies have vulnerabilities?

## 3. What are we going to do about it?

| Threat | Mitigation | Priority |
|--------|------------|----------|
| _[SQL Injection]_ | _[Parameterized queries]_ | _[High]_ |
| _[XSS]_ | _[Output encoding]_ | _[High]_ |
| _[Unauthorized access]_ | _[JWT + RBAC]_ | _[High]_ |

## 4. Did we do a good job?

### Verification Steps
- [ ] Code review focused on security
- [ ] Automated security testing (npm audit)
- [ ] Manual testing of auth boundaries
- [ ] Penetration testing (if applicable)

## 5. What's left?

### Accepted Risks
| Risk | Reason for Acceptance | Review Date |
|------|----------------------|-------------|
| _[Example]_ | _[Low impact, high mitigation cost]_ | _[Date]_ |

### Future Improvements
- [ ] Improvement 1
- [ ] Improvement 2
```

---

### Appendix F: CONTRIBUTING.md Template

```markdown
# Contributing to [Project Name]

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)

## Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to:
- Be respectful and inclusive
- Accept constructive criticism gracefully
- Focus on what is best for the community

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/PROJECT_NAME.git`
3. Add upstream remote: `git remote add upstream https://github.com/ORIGINAL_OWNER/PROJECT_NAME.git`
4. Create a branch: `git checkout -b feature/your-feature-name`

## How to Contribute

### Reporting Bugs
- Check existing issues first
- Use the bug report template
- Include reproduction steps
- Include environment details

### Suggesting Features
- Check existing feature requests
- Use the feature request template
- Explain the use case clearly

### Code Contributions
1. Find an issue to work on (or create one)
2. Comment on the issue to claim it
3. Follow the development setup
4. Submit a pull request

## Development Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Run tests
npm test

# Start development server
npm run dev
```

## Pull Request Process

1. **Before submitting:**
   - [ ] Tests pass locally
   - [ ] Linting passes
   - [ ] Documentation updated
   - [ ] Commit messages follow convention

2. **PR requirements:**
   - Clear description of changes
   - Link to related issue
   - Screenshots (if UI changes)
   - Test plan documented

3. **Review process:**
   - At least 1 approval required
   - Address all review comments
   - Keep PR scope focused

## Style Guidelines

### Code Style
- Follow existing patterns in the codebase
- Run `npm run lint` before committing
- Run `npm run format` for consistent formatting

### Commit Messages
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Branch Naming
```
feature/ABC-123-short-description
bugfix/ABC-456-fix-description
docs/update-readme
```

## Questions?

- Open a GitHub Discussion for general questions
- Open an Issue for bugs or feature requests
- Tag maintainers if urgent

Thank you for contributing!
```

---

### Appendix G: CHANGELOG.md Format

Based on [Keep a Changelog](https://keepachangelog.com/) format.

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New features that have been added

### Changed
- Changes in existing functionality

### Deprecated
- Features that will be removed in future versions

### Removed
- Features that have been removed

### Fixed
- Bug fixes

### Security
- Security vulnerability fixes

---

## [1.1.0] - 2026-01-30

### Added
- User authentication with JWT refresh tokens
- Dark mode toggle in settings
- CSV export functionality

### Changed
- Improved dashboard loading performance
- Updated API rate limiting (100 → 200 requests/min)

### Fixed
- Login redirect loop on expired sessions (#123)
- Stock calculation rounding errors (#145)

---

## [1.0.0] - 2026-01-15

### Added
- Initial release
- Item management (CRUD)
- Purchase order workflow
- Job order tracking
- FIFO batch management
- User roles and permissions

---

[Unreleased]: https://github.com/org/repo/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/org/repo/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/org/repo/releases/tag/v1.0.0
```

**Changelog Guidelines:**

| Section | When to Use |
|---------|-------------|
| `Added` | New features |
| `Changed` | Changes in existing functionality |
| `Deprecated` | Soon-to-be removed features |
| `Removed` | Now removed features |
| `Fixed` | Bug fixes |
| `Security` | Vulnerability fixes |

**Automation:**
- Use [standard-version](https://github.com/conventional-changelog/standard-version) or [semantic-release](https://github.com/semantic-release/semantic-release) for automated changelog generation from commit messages.

---

### Appendix H: GitHub Template Files

Store these in `.github/` directory for automatic use in GitHub Issues and PRs.

#### H.1 Bug Report Template

**File:** `.github/ISSUE_TEMPLATE/bug_report.md`

```markdown
---
name: Bug Report
about: Report a bug to help us improve
title: '[BUG] '
labels: 'bug, needs-triage'
assignees: ''
---

## Bug Description
<!-- A clear and concise description of the bug -->

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected Behavior
<!-- What you expected to happen -->

## Actual Behavior
<!-- What actually happened -->

## Screenshots
<!-- If applicable, add screenshots -->

## Environment
- **OS:** [e.g., Windows 11, macOS 14]
- **Browser:** [e.g., Chrome 120, Firefox 121]
- **Node Version:** [e.g., 18.19.0]
- **App Version:** [e.g., 1.2.0]

## Additional Context
<!-- Any other relevant information -->

## Possible Solution
<!-- Optional: If you have ideas on how to fix this -->
```

#### H.2 Feature Request Template

**File:** `.github/ISSUE_TEMPLATE/feature_request.md`

```markdown
---
name: Feature Request
about: Suggest a new feature or enhancement
title: '[FEATURE] '
labels: 'enhancement, needs-triage'
assignees: ''
---

## Feature Summary
<!-- One-sentence description of the feature -->

## Problem Statement
<!-- What problem does this solve? Why is it needed? -->

## Proposed Solution
<!-- Describe how you'd like this to work -->

## Alternatives Considered
<!-- Any alternative solutions or features you've considered -->

## User Stories
<!-- Who benefits and how? -->
- As a [role], I want [feature] so that [benefit]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Additional Context
<!-- Mockups, examples, or other relevant information -->

## Priority
<!-- How important is this to you? -->
- [ ] Critical - Blocking my work
- [ ] High - Significant impact
- [ ] Medium - Would be nice
- [ ] Low - Minor improvement
```

#### H.3 Pull Request Template

**File:** `.github/PULL_REQUEST_TEMPLATE.md`

```markdown
## Summary
<!-- What does this PR do? Link to related issue(s) -->

Closes #

## Type of Change
<!-- Check all that apply -->
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Performance improvement
- [ ] Test addition or update

## Changes Made
<!-- List the specific changes -->
- Change 1
- Change 2
- Change 3

## Test Plan
<!-- How was this tested? -->
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

**Manual Test Steps:**
1. Step one
2. Step two
3. Expected result

## Screenshots
<!-- If UI changes, add before/after screenshots -->

| Before | After |
|--------|-------|
| [screenshot] | [screenshot] |

## Checklist
<!-- Verify all items before requesting review -->
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Deployment Notes
<!-- Any special deployment considerations? -->
- [ ] Database migration required
- [ ] Environment variable changes
- [ ] Cache invalidation needed
- [ ] None

## Reviewer Notes
<!-- Anything specific reviewers should focus on? -->
```

#### H.4 Issue Config (Optional)

**File:** `.github/ISSUE_TEMPLATE/config.yml`

```yaml
blank_issues_enabled: false
contact_links:
  - name: Documentation
    url: https://github.com/org/repo/wiki
    about: Check the documentation before opening an issue
  - name: Discussions
    url: https://github.com/org/repo/discussions
    about: Ask questions and discuss ideas
```

#### H.5 Directory Structure

```
.github/
├── ISSUE_TEMPLATE/
│   ├── bug_report.md
│   ├── feature_request.md
│   └── config.yml
├── PULL_REQUEST_TEMPLATE.md
├── CODEOWNERS
└── workflows/
    └── ci.yml
```

#### H.6 CODEOWNERS File

**File:** `.github/CODEOWNERS`

```
# Default owners for everything
* @default-reviewer

# Frontend owners
/apps/dgfy-web/ @frontend-team

# Backend owners
/backend/ @backend-team

# Documentation owners
/docs/ @docs-team
*.md @docs-team

# CI/CD owners
/.github/ @devops-team

# Database changes require DBA review
/backend/src/models/ @dba-team
/backend/src/migrations/ @dba-team
```

---

## Quick Reference Links

| Topic | This Guide | Project Docs |
|-------|------------|--------------|
| Project Setup | [Section 4.1](#41-environment-setup-workflow) | [docs/development/environment-setup.md](docs/development/environment-setup.md) |
| API Standards | [Section 2.1](#21-the-documentation-first-rule) | [docs/api/specification.md](docs/api/specification.md) |
| Testing | [Section 5.2](#52-testing-pyramid) | [docs/development/guidelines.md](docs/development/guidelines.md) |
| Security | [Section 6](#6-security-by-default) | [docs/development/guidelines.md#security-checklist](docs/development/guidelines.md#security-checklist) |
| Deployment | [Section 7](#7-operations--reliability) | [docs/ops/PRODUCTION_CHECKLIST.md](docs/ops/PRODUCTION_CHECKLIST.md) |
| CI/CD | [Section 5.3](#53-the-clean-build-rule) | [.github/workflows/ci.yml](.github/workflows/ci.yml) |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.1 | 2026-05-03 | Added SKUpervisor current-state overlay for hosting profiles, tenant registration approval mode, registration rate limits, and payment-disabled policy |
| 1.1.0 | 2026-01-31 | Added Section 2.4: AI/ML Feature Documentation (documentation sync pattern) |
| 1.0.0 | 2026-01 | Initial version |

---

*This guide is designed to evolve with your project. Update it as your team grows and practices mature.*
