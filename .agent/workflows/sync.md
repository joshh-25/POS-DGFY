---
description: Synchronize dependencies for root, frontend, and backend folders
---
// turbo-all

# Dependency Sync Workflow

This workflow ensures all `node_modules` are up to date across the entire project.

### 1. Root Dependencies
```bash
npm install
```

### 2. Backend Dependencies
```bash
cd backend
npm install
cd ..
```

### 3. Frontend Dependencies
```bash
cd apps/dgfy-ims && npm install && cd ../..
cd apps/dgfy-pos && npm install && cd ../..
cd apps/dgfy-storefront && npm install && cd ../..
```
