# Project Documentation Guide

> **Purpose**: A universal framework for documenting software projects consistently and effectively, regardless of technology stack or project type.

---

## Table of Contents

1. [Documentation Philosophy](#1-documentation-philosophy)
2. [Documentation Structure Overview](#2-documentation-structure-overview)
3. [Root-Level Documentation Files](#3-root-level-documentation-files)
4. [Technical Documentation Directory](#4-technical-documentation-directory)
5. [AI Assistant Configuration](#5-ai-assistant-configuration)
6. [Workflow Automation](#6-workflow-automation)
7. [CI/CD Configuration](#7-cicd-configuration)
8. [Documentation Maintenance](#8-documentation-maintenance)
9. [New Project Checklist](#9-new-project-checklist)
10. [Quick Reference](#10-quick-reference)

---

## 1. Documentation Philosophy

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Single Source of Truth** | Each piece of information should exist in exactly one place |
| **Update Together** | Code changes and documentation updates happen in the same commit |
| **Progressive Detail** | Start with quick guides, link to detailed docs for deep dives |
| **Environment Parity** | Document both development and production configurations |
| **Accessibility** | Write for developers of varying experience levels |

### Documentation Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Quick Reference (README, QUICK_START)             │
│  → For: First-time visitors, quick onboarding               │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Setup & Operations (SETUP, PREREQUISITES)         │
│  → For: New team members setting up environment              │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Technical Deep Dives (docs/ directory)            │
│  → For: Developers working on specific components            │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: AI & Automation (.claude/, .agent/, .github/)     │
│  → For: AI assistants, CI/CD pipelines                       │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: Historical Record (DEVELOPMENT_HISTORY)           │
│  → For: Understanding project evolution                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Documentation Structure Overview

### Recommended Directory Structure

```
PROJECT_ROOT/
│
├── 📄 README.md                  # Project entry point
├── 📄 QUICK_START.md             # 5-minute setup guide
├── 📄 SETUP.md                   # Complete setup instructions
├── 📄 PREREQUISITES.md           # Environment requirements
├── 📄 TROUBLESHOOTING.md         # Common errors & solutions
├── 📄 DEVELOPMENT_HISTORY.md     # Changelog & development log
│
├── 📁 docs/                      # Technical documentation
│   ├── README.md                 # Documentation index
│   ├── MIGRATION_MAP.md          # File location changes
│   ├── 📁 ai/                    # AI guidelines & logs
│   ├── 📁 api/                   # API documentation
│   ├── 📁 architecture/          # System design & proposals
│   ├── 📁 database/              # Data models
│   ├── 📁 development/           # Dev guides
│   ├── 📁 features/              # Feature specifications
│   ├── 📁 guides/                # Process guides
│   ├── 📁 reference/             # Cheatsheets
│   └── 📁 setup/                 # Component setup
│
├── 📁 .agent/                    # AI workflow definitions
└── 📁 .github/                   # GitHub automation
```

---

## 3. Root-Level Documentation Files

### 3.1 README.md — Project Entry Point

**Purpose**: First file visitors see. Provides project overview and navigation.

**Template Structure**:

```markdown
# [Project Name]

[One-sentence description of what the project does]

## 🏗️ Project Structure

[Brief overview of main directories]

## 🚀 Quick Start

### Prerequisites
- [Requirement 1]
- [Requirement 2]

### Installation
1. Clone the repository
2. [Install command]
3. [Run command]

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [QUICK_START.md](QUICK_START.md) | Fast setup guide |
| [SETUP.md](SETUP.md) | Detailed setup |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Error solutions |

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| `[command]` | [What it does] |

## 🤝 Contributing

[Brief contribution guidelines]

## 📄 License

[License type]
```

---

### 3.2 AI Context File (CLAUDE.md or PROJECT_CONTEXT.md)

**Purpose**: Provides context for AI assistants working on the project.

**Key Guidelines**:
- Keep under 1,000 tokens for optimal AI performance
- Link to detailed docs instead of embedding content
- Include critical rules that AI must follow
- **Mandatory**: Include the "Debugging Protocol" section referencing `TROUBLESHOOTING.md`
- Update version number with releases

**Template Structure**:

```markdown
# [Project Name] - AI Context

**Project Type**: [e.g., Web App, Mobile App, API Service, CLI Tool]
**Last Updated**: [Date]
**Version**: [X.Y.Z]

## Project Overview
[2-3 sentence description of what the project does and its purpose]

## Technology Stack
| Layer | Technology |
|-------|------------|
| [Layer] | [Technology] |

## Key Features
1. [Feature]: [Brief description]
2. [Feature]: [Brief description]

## Critical Rules

### [Category] Rules
1. [Rule with reasoning]
2. [Rule with reasoning]

## Project Structure
[ASCII tree of main directories - keep concise]

## Common Commands
- **[Action]**: `[command]`

## Documentation Links
- [API Specification](docs/api/specification.md)
- [Setup Guide](SETUP.md)

## Troubleshooting Quick Reference
| Issue | Solution |
|-------|----------|
| [Error] | [Fix] |
```

---

### 3.3 QUICK_START.md — Fast Onboarding

**Purpose**: Get someone running the project in 5 minutes.

**Template Structure**:

```markdown
# Quick Start Guide

## Prerequisites Checklist
- [ ] [Requirement] — Verify: `[check command]`
- [ ] [Requirement] — Verify: `[check command]`

---

## Step 1: [First Action]

[Instructions]

**Expected Output:**
```
[what they should see]
```

---

## Step 2: [Second Action]

[Instructions]

---

## Verification

| Check | How to Verify |
|-------|---------------|
| [Component] running | [Method/URL] |

---

## Common Issues

### [Problem]
**Cause**: [Why it happens]
**Solution**: [How to fix]
```

---

### 3.4 SETUP.md — Complete Setup Instructions

**Purpose**: Detailed setup for complete environment configuration.

**Template Structure**:

```markdown
# [Project Name] - Setup Guide

## Prerequisites
[Detailed list with download links and version requirements]

## Installation Options

### Option 1: [Method Name] (Recommended)
[Step-by-step instructions]

### Option 2: [Alternative Method]
[Step-by-step instructions]

---

## Configuration

### Environment Variables
[Table of all environment variables with descriptions]

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VAR_NAME` | Yes/No | `value` | What it does |

### [Other Configuration]
[Configuration instructions]

---

## Running the Application

### Development Mode
[Commands and expected behavior]

### Production Mode
[Commands and expected behavior]

---

## Next Steps
1. [First thing to do after setup]
2. [Second thing]

---

## Need Help?
- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- See [docs/](docs/) for detailed documentation
```

---

### 3.5 PREREQUISITES.md — Environment Requirements

**Purpose**: Compare requirements across different environments (local, staging, production).

**Template Structure**:

```markdown
# [Project Name] - Prerequisites Guide

## Environment Comparison

| Component | Local Development | Production Server |
|-----------|-------------------|-------------------|
| [Runtime] | [Version] | [Version] |
| [Database] | [Version] | [Version] |
| [Process Manager] | [Tool] | [Tool] |

---

## Local Development Environment

### Required Software
#### 1. [Software Name]
- **Download**: [URL]
- **Required Version**: [Version]
- **Verify Installation**: `[command]`

### Setup Steps
[Numbered list of commands]

### Environment Variables
[Environment-specific variables]

---

## Production/Hosting Environment

### Server Requirements
[Same structure as local]

### Configuration Files
[Production-specific config]

---

## Syncing Between Environments

### Workflow Diagram
```
Local → [Version Control] → Production
```

### What Must Match
| Component | Must Match? | Notes |
|-----------|-------------|-------|
| [Schema] | Yes | [How to sync] |
| [Secrets] | No | Must be different |
```

---

### 3.6 TROUBLESHOOTING.md — Error Solutions

**Purpose**: Catalog of known errors and their solutions.

**Template Structure**:

```markdown
# [Project Name] - Troubleshooting Guide

## Table of Contents
- [Quick Diagnostics](#quick-diagnostics)
- [Category 1 Errors](#category-1-errors)
- [Category 2 Errors](#category-2-errors)

---

## Quick Diagnostics

### Health Check Commands
| Environment | Command | Expected Result |
|-------------|---------|-----------------|
| Local | `[command]` | [Result] |
| Production | `[command]` | [Result] |

---

## [Category] Errors

### [Error Name]

**Symptoms**: [What the user sees]

| Cause | Solution |
|-------|----------|
| [Cause 1] | [Fix 1] |
| [Cause 2] | [Fix 2] |

**Diagnosis**:
```bash
[diagnostic command]
```

**Fix**:
```bash
[fix command]
```

---

## Log Locations

| Environment | Location |
|-------------|----------|
| Local | `[path]` |
| Production | `[path]` |

---

## Getting Help
1. Check logs
2. Search this document
3. [Other support channels]
```

---

### 3.7 DEVELOPMENT_HISTORY.md — Project Changelog

**Purpose**: Track all development phases, features, and major fixes.

**Template Structure**:

```markdown
# [Project Name] - Development History

> **Purpose**: Track all development phases from inception to current state

---

## Phase [N]: [Phase Name]
**Status**: ✅ COMPLETE | 🔄 IN PROGRESS | ⏳ PENDING
**Date**: [YYYY-MM-DD]

### [Category]
- [x] Completed task
- [ ] Pending task

### Bug Fixes
- **[Issue]**: Description
  - **Root Cause**: [What caused it]
  - **Fix**: [What was changed]
  - **Files Modified**: `[file.ext]`

### Lessons Learned
1. [Insight]

---

## Changelog Summary

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | [Date] | [Summary] |
```

---

## 4. Technical Documentation Directory

### 4.1 docs/README.md — Documentation Index

**Purpose**: Navigation hub for all technical documentation.

**Template Structure**:

```markdown
# [Project Name] - Documentation

## Documentation Principles
1. `/docs` is the source of truth for technical specifications
2. Code changes require documentation updates
3. Use relative links for cross-references

---

## Quick Navigation

### Architecture
- [System Architecture](./architecture/system-architecture.md)

### API
- [API Specification](./api/specification.md)
- [Integration Guide](./api/integration-guide.md)

### Database
- [Database Schema](./database/schema.md)

### Development
- [Development Guidelines](./development/guidelines.md)
- [Environment Setup](./development/environment-setup.md)

---

## For Different Roles

### New Developers
1. Start with [Environment Setup](./development/environment-setup.md)
2. Review [System Architecture](./architecture/system-architecture.md)

### [Other Role]
[Recommended reading path]
```

---

### 4.2 Subdirectory Organization

| Directory | Contents |
|-----------|----------|
| `docs/api/` | API endpoints, request/response schemas, integration patterns |
| `docs/architecture/` | System diagrams, component relationships, data flows |
| `docs/database/` | Schema definitions, ERD, migration guides |
| `docs/development/` | Coding standards, testing guides, roadmaps |
| `docs/images/` | Diagrams and screenshots |

---

## 5. AI Assistant Configuration

### 5.1 Directory Structure

```
.claude/ (or .ai/, .cursor/, etc.)
├── settings.local.json    # Permission configuration
├── project-context.md     # Session-persistent context
└── hooks/
    └── session-start.sh   # Session initialization
```

### 5.2 settings.local.json — Permissions

**Purpose**: Define commands AI can auto-run safely.

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run:*)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(curl:*)",
      "Bash(grep:*)"
    ]
  }
}
```

### 5.3 project-context.md — Session Context

**Purpose**: Track session-specific context that persists across AI interactions.

```markdown
# Project Context

## Current Work
[What's being worked on]

## Key Decisions Made
[Important decisions and their reasoning]

## Known Issues
[Current bugs or blockers]

## Modified Files This Session
- [file1.ext]
- [file2.ext]

## Notes
- Last updated: [Date]
```

### 5.4 session-start.sh — Initialization

**Purpose**: Run checks when starting a new AI session.

```bash
#!/bin/bash
echo "🚀 Project Session Start"
echo "════════════════════════"

# Check dependencies
if [ -d "node_modules" ]; then
    echo "✅ Dependencies installed"
else
    echo "⚠️  Run: [install command]"
fi

# Check configuration
if [ -f ".env" ]; then
    echo "✅ Environment configured"
else
    echo "⚠️  Missing .env file"
fi

# Show git context
echo ""
echo "📍 Git: $(git branch --show-current 2>/dev/null)"
echo "📝 Last: $(git log -1 --oneline 2>/dev/null)"
```

---

## 6. Workflow Automation

### 6.1 .agent/workflows/ Directory

**Purpose**: Define step-by-step workflows for AI agents.

### 6.2 Workflow Template

```markdown
---
description: [Brief description of what this workflow does]
---

# [Workflow Name]

## Prerequisites
- [Requirement 1]
- [Requirement 2]

## Steps

### 1. [First Step]
```bash
[command]
```

// turbo
### 2. [Auto-run Step]
```bash
[safe command that can auto-run]
```

### 3. [Manual Step]
[Instructions requiring judgment]

---

## Troubleshooting
### [Error]
- **Solution**: [Fix]

---

## Quick Reference
```bash
# Copy-paste sequence
[command 1]
[command 2]
```
```

**Note**: The `// turbo` annotation indicates steps that can be auto-run by AI agents.

---

## 7. CI/CD Configuration

### 7.1 .github/workflows/

**Purpose**: Automated testing and deployment pipelines.

### 7.2 CI Template

```yaml
name: CI Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup [Runtime]
        uses: actions/setup-[runtime]@v3
        with:
          [runtime]-version: '[version]'
      
      - name: Install dependencies
        run: [install command]
      
      - name: Run tests
        run: [test command]

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - name: Build
        run: [build command]
```

---

## 8. Documentation Maintenance

### 8.1 When to Update Documentation

| Event | What to Update |
|-------|----------------|
| New feature added | API docs, README features list |
| Bug fixed | TROUBLESHOOTING if common error |
| Config changed | SETUP, PREREQUISITES, .env.example |
| Breaking change | README, CLAUDE.md, migration guide |
| Release | DEVELOPMENT_HISTORY, version numbers |

### 8.2 Documentation Review Checklist

- [ ] All code changes have corresponding doc updates
- [ ] Cross-references/links are valid
- [ ] Examples are current and runnable
- [ ] Version numbers updated if applicable
- [ ] Diagrams updated if architecture changed

### 8.3 Linking Best Practices

```markdown
<!-- Relative links between docs -->
See [Setup Guide](../SETUP.md) for details.

<!-- Links within same directory -->
See [API Specification](./specification.md).

<!-- Links from root to docs -->
See [Architecture](docs/architecture/system-architecture.md).
```

---

## 9. New Project Checklist

### Phase 1: Project Initialization (Day 1)
- [ ] Create `README.md` with basic project info
- [ ] Create `LICENSE`
- [ ] Create `.gitignore`

### Phase 2: Development Setup (Week 1)
- [ ] Create `SETUP.md` with setup instructions
- [ ] Create `QUICK_START.md` for fast onboarding
- [ ] Create `.env.example` with all variables documented
- [ ] Create `CLAUDE.md` (or equivalent AI context file)

### Phase 3: As Development Progresses
- [ ] Initialize `DEVELOPMENT_HISTORY.md` and update with each phase
- [ ] Create `docs/` directory structure
- [ ] Create `docs/README.md` index
- [ ] Add API documentation as endpoints are built
- [ ] Document database schema

### Phase 4: Pre-Deployment
- [ ] Create `PREREQUISITES.md` covering all environments
- [ ] Create `TROUBLESHOOTING.md` from encountered issues
- [ ] Create `.agent/workflows/deploy.md`
- [ ] Create `.github/workflows/ci.yml`

### Phase 5: Ongoing
- [ ] Update `DEVELOPMENT_HISTORY.md` with each release
- [ ] Add new errors to `TROUBLESHOOTING.md`
- [ ] Keep AI context files updated

---

## 10. Quick Reference

### Initialize Documentation Structure Command

```bash
# Create all directories
mkdir -p docs/{api,architecture,database,development,images}
mkdir -p .claude/hooks
mkdir -p .agent/workflows
mkdir -p .github/workflows

# Create root files
touch README.md CLAUDE.md SETUP.md QUICK_START.md
touch PREREQUISITES.md TROUBLESHOOTING.md DEVELOPMENT_HISTORY.md
touch LICENSE .gitignore .env.example

# Create docs files
touch docs/README.md docs/QUICK_REFERENCE.md
touch docs/api/specification.md
touch docs/architecture/system-architecture.md
touch docs/database/schema.md
touch docs/development/{guidelines.md,environment-setup.md}

# Create AI and automation files
touch .claude/settings.local.json .claude/project-context.md
touch .claude/hooks/session-start.sh
touch .agent/workflows/deploy.md
touch .github/workflows/ci.yml
```

### Documentation Linking Hierarchy

```
README.md (Entry Point)
    ↓
├── QUICK_START.md (Fast Path)
├── SETUP.md (Detailed Path)
│       ↓
│   PREREQUISITES.md
│       ↓
│   TROUBLESHOOTING.md
│
└── docs/README.md (Technical Hub)
        ↓
    ├── docs/api/
    ├── docs/architecture/
    ├── docs/database/
    └── docs/development/
```

### File Purpose Summary

| File | One-Line Purpose |
|------|------------------|
| `README.md` | Project overview and navigation |
| `CLAUDE.md` | AI assistant context and rules |
| `QUICK_START.md` | 5-minute setup guide |
| `SETUP.md` | Complete setup instructions |
| `PREREQUISITES.md` | Environment requirements |
| `TROUBLESHOOTING.md` | Error catalog and solutions |
| `DEVELOPMENT_HISTORY.md` | Development changelog |
| `docs/README.md` | Technical docs navigation |

---

*This guide provides a framework for documentation. Adapt the templates to your project's specific needs while maintaining the organizational principles outlined here.*
