---
description: Synchronize dependencies for root, backend, migration-runner, and the three frontend apps
---
// turbo-all

# Dependency Sync Workflow

This workflow ensures all `node_modules` are up to date across the entire project. Mirrors root
`package.json`'s own `install:all` script.

### 1. Root Dependencies
```bash
npm install
```

### 2. Backend Dependencies
```bash
cd apps/dgfy-api
npm install
cd ../..
```

### 3. Migration Runner Dependencies
```bash
cd apps/dgfy-migration-runner
npm install
cd ../..
```

### 4. Frontend Dependencies
```bash
cd apps/dgfy-ims && npm install && cd ../..
cd apps/dgfy-pos && npm install && cd ../..
cd apps/dgfy-storefront && npm install && cd ../..
```
