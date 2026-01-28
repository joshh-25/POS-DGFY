---
description: Check system health, service status, and logs
---
// turbo-all

# System Health Check Workflow

### 1. PM2 Service Status
```bash
pm2 status
```

### 2. Recent Backend Logs
```bash
pm2 logs sku-backend --lines 20 --no-daemon
```

### 3. Recent Frontend Logs
```bash
pm2 logs sku-frontend --lines 20 --no-daemon
```

### 4. API Connectivity Test
```bash
curl -I http://localhost:5001/api/v1/health
```
