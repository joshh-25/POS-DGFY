---
description: Automatically fix linting and formatting issues
---
// turbo-all

# Code Fixer Workflow

### 1. Backend Lint Fix
```bash
cd apps/dgfy-api
npm run lint -- --fix
cd ../..
```

### 2. Frontend Lint Fix
```bash
cd apps/dgfy-ims && npm run lint -- --fix && cd ../..
cd apps/dgfy-pos && npm run lint -- --fix && cd ../..
cd apps/dgfy-storefront && npm run lint -- --fix && cd ../..
```
