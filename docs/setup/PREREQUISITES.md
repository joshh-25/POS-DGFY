# SKU Inventory Manager - Prerequisites Guide

This document outlines the prerequisites for running the SKU Inventory Manager in both **Local Development** and **Development/Hosting Server** environments, ensuring changes sync correctly across both.

---

## Quick Comparison

| Component | Local (Windows/XAMPP) | Hosting Server (Linux) |
|-----------|----------------------|------------------------|
| **Node.js** | 18+ | 18+ |
| **npm** | 9+ | 9+ |
| **MySQL** | 8.0+ (XAMPP or standalone) | 8.0+ |
| **Redis** | Optional (Memurai/Docker) | 7.x (systemd) |
| **Process Manager** | Terminal/nodemon | PM2 |
| **Web Server** | Vite dev server | Nginx (reverse proxy) |
| **Git** | Required | Required |

---

## Local Development Environment

### Required Software

#### 1. Node.js (v18+)
- **Download**: https://nodejs.org/
- **Verify**: `node -v` should show v18.x or higher
- Includes npm (v9+)

#### 2. MySQL (v8.0+)
Choose one option:
- **XAMPP** (recommended for Windows): https://www.apachefriends.org/
  - Start MySQL via XAMPP Control Panel
  - Default port: 3306
- **Standalone MySQL**: https://dev.mysql.com/downloads/mysql/

#### 3. Git
- **Download**: https://git-scm.com/downloads
- **Verify**: `git --version`

#### 4. Redis (Optional but Recommended)
Redis enables caching and token blacklisting. **The app works without it** but performance is better with it.

See [REDIS_SETUP.md](REDIS_SETUP.md) for detailed Windows installation options:
- **Memurai** (native Windows Redis-compatible server)
- **Docker** (`docker run -d --name redis-sku -p 6379:6379 redis:latest`)
- **WSL** (Windows Subsystem for Linux)

---

### Local Setup Steps

```bash
# 1. Clone repository
git clone <repository-url>
cd SKU-Inventory-Manager

# 2. Install all dependencies
npm run install:all

# 3. Backend configuration
cd backend
cp .env.example .env
# Edit .env with your MySQL credentials (see below)

# 4. Setup database (creates DB if needed, runs migrations)
npm run setup:db -- --seed

# 5. Start development servers (from root directory)
cd ..
npm run dev
```

### Local Environment Variables

**Backend (`backend/.env`):**
```env
NODE_ENV=development
PORT=5000

# Database - adjust for your XAMPP/MySQL setup
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sku_inventory_manager
DB_USER=root
DB_PASSWORD=          # Empty for XAMPP default

# JWT Secrets (generate strong secrets for production!)
JWT_SECRET=your-local-dev-secret-min-32-chars-long!
JWT_EXPIRY=24h
REFRESH_TOKEN_SECRET=your-refresh-secret-also-32-chars!
REFRESH_TOKEN_EXPIRY=7d

# CORS - matches frontend dev server
CORS_ORIGIN=http://localhost:5173

# Redis (optional)
REDIS_URL=redis://localhost:6379
```

**Frontend (`frontend/.env`):**
```env
VITE_API_URL=http://localhost:5000/api/v1
```

> [!TIP]
> For accessing from other devices on your network (e.g., mobile testing), use your local IP:
> ```env
> VITE_API_URL=http://10.123.33.49:5000/api/v1
> ```

### Local Development URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:5000/api/v1 |
| Health Check | http://localhost:5000/health |

---

## Development/Hosting Server Environment

### Server Requirements

#### 1. Operating System
- Linux (Ubuntu 20.04+ recommended)
- SSH access (`ssh root@hermes-cloud`)

#### 2. Node.js (v18+)
```bash
# Install via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node -v
npm -v
```

#### 3. MySQL (v8.0+)
```bash
sudo apt-get install mysql-server
sudo mysql_secure_installation
```

#### 4. Redis (v7.x)
```bash
sudo apt-get install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Verify
redis-cli ping  # Should return PONG
```

#### 5. PM2 (Process Manager)
```bash
npm install -g pm2
```

#### 6. Nginx (Reverse Proxy)
```bash
sudo apt-get install nginx
```

---

### Server Directory Structure

```
/var/www/skupervisor/
├── frontend/          # Built static files served by Nginx
│   └── dist/          # Production build output
├── backend/           # Node.js API server (PM2 managed)
│   └── .env           # Production environment variables
└── ...
```

### Server Environment Variables

**Backend (`/var/www/skupervisor/backend/.env`):**
```env
NODE_ENV=production
PORT=5001              # Different port from local to avoid conflicts

# Database - production credentials
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sku_inventory_manager
DB_USER=sku_user       # Dedicated database user
DB_PASSWORD=STRONG_PRODUCTION_PASSWORD

# JWT Secrets (MUST be different from local!)
JWT_SECRET=PRODUCTION_SECRET_GENERATE_WITH_CRYPTO_RANDOMYTES
JWT_EXPIRY=24h
REFRESH_TOKEN_SECRET=DIFFERENT_PRODUCTION_SECRET_VERY_LONG
REFRESH_TOKEN_EXPIRY=7d

# CORS - production domains that call backend APIs directly
CORS_ORIGIN=https://skupervisor.surebizcorp.com,https://surebizcorp.com,https://pos.surebizcorp.com,https://store.surebizcorp.com,https://skupervisor.dgfy.ph,https://pos.dgfy.ph,https://dgfy.ph,https://store.dgfy.ph

# Redis
REDIS_URL=redis://localhost:6379
```

### PM2 Configuration

The project includes PM2 ecosystem config files:
- `ecosystem.config.cjs` - Development configuration
- `ecosystem.prod.config.cjs` - Production configuration

**Start services with PM2:**
```bash
cd /var/www/skupervisor

# Start using ecosystem config (recommended)
pm2 start ecosystem.config.cjs --env production

# Or for production-specific config
pm2 start ecosystem.prod.config.cjs

# Save the process list for auto-restart
pm2 save

# Enable auto-start on system reboot
pm2 startup
```

**Common PM2 Commands:**
```bash
# Restart all services
pm2 restart all

# Restart specific service
pm2 restart sku-backend

# View logs (last 50 lines)
pm2 logs sku-backend --lines 50

# View all logs
pm2 logs --lines 50

# Check status
pm2 status

# Stop all services
pm2 stop all

# Delete all processes
pm2 delete all
```

### Nginx Configuration

**`/etc/nginx/sites-available/skupervisor`:**
```nginx
server {
    listen 80;
    server_name skupervisor.surebizcorp.com;
    
    # Frontend - serve static files
    location / {
        root /var/www/skupervisor/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API - reverse proxy to PM2
    location /api {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/skupervisor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Server URLs

| Service | URL |
|---------|-----|
| IMS frontend | https://skupervisor.dgfy.ph |
| POS frontend | https://pos.dgfy.ph |
| Storefront root | https://dgfy.ph |
| Storefront app | https://store.dgfy.ph |
| Backend API | https://skupervisor.dgfy.ph/api/v1 |
| Health Check | https://skupervisor.dgfy.ph/health |

Legacy SureBiz production domains remain supported while DNS and customer links transition:

| Service | URL |
|---------|-----|
| IMS frontend | https://skupervisor.surebizcorp.com |
| POS frontend | https://pos.surebizcorp.com |
| Storefront root | https://surebizcorp.com |
| Storefront app | https://store.surebizcorp.com |

---

## Syncing Changes Between Environments

### Development Workflow

```
┌─────────────────┐     git push      ┌─────────────────┐
│  Local Machine  │ ───────────────▶  │     GitHub      │
│  (development)  │                   │   (repository)  │
└─────────────────┘                   └─────────────────┘
                                              │
                                       git pull
                                              │
                                              ▼
                                      ┌─────────────────┐
                                      │  Hosting Server │
                                      │  (production)   │
                                      └─────────────────┘
```

### Step-by-Step Sync Process

#### 1. Local Development
```bash
# Make changes on local machine
# Test thoroughly on localhost

# Commit and push
git add .
git commit -m "Description of changes"
git push origin master
```

#### 2. Deploy to Hosting Server
```bash
# SSH into server
ssh root@hermes-cloud
cd /var/www/skupervisor

# Pull latest changes
git pull origin master

# Install any new dependencies
cd backend && npm install && cd ..
cd frontend && npm install && npm run build && cd ..

# Run migrations if database changes
cd backend && npx sequelize-cli db:migrate && cd ..

# Restart services
pm2 restart all

# Verify deployment
pm2 logs sku-backend --lines 20
```

> [!IMPORTANT]
> Always run `npm run build` in the frontend after pulling changes. The hosting server serves the built files from `frontend/dist/`, not the development server.

### What Needs to Match

| Component | Must Match? | Notes |
|-----------|-------------|-------|
| Database schema | ✅ Yes | Run migrations on both |
| Backend code | ✅ Yes | Same repository |
| Frontend code | ✅ Yes | Build after pull |
| Environment variables | ⚠️ Similar | Different hosts/ports |
| Test data | ❌ No | Can differ |
| Secrets | ❌ No | MUST be different |

---

## Troubleshooting

### Local Issues

| Issue | Solution |
|-------|----------|
| MySQL not starting | Start XAMPP Control Panel → MySQL Start |
| Port 5173 in use | Kill process: `npx kill-port 5173` |
| Port 5000 in use | Kill process: `npx kill-port 5000` |
| CORS errors | Check `CORS_ORIGIN` in backend `.env` |

### Hosting Server Issues

| Issue | Solution |
|-------|----------|
| 502 Bad Gateway | PM2 crashed: `pm2 restart sku-backend` |
| 404 on API routes | Check PM2 status: `pm2 status` |
| Changes not visible | Hard refresh: `Ctrl + Shift + R` |
| Migration errors | Check: `npx sequelize-cli db:migrate:status` |

---

## Security Checklist

### Local Development
- [ ] Never commit `.env` files to repository
- [ ] Use `.env.example` for sharing configuration templates
- [ ] Local secrets can be simple (development only)

### Hosting Server
- [ ] Generate strong, unique JWT secrets (32+ chars)
- [ ] Create dedicated MySQL user (not root)
- [ ] Enable firewall (ufw)
- [ ] Set up SSL certificate (Let's Encrypt)
- [ ] Restrict SSH access
- [ ] Regular backups of database
- [ ] Keep dependencies updated

---

## Related Documentation

- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common errors and solutions
- [SETUP.md](SETUP.md) - Complete local setup guide
- [REDIS_SETUP.md](REDIS_SETUP.md) - Redis installation for Windows
- [ADMIN_SETUP.md](ADMIN_SETUP.md) - Admin user configuration
- [.agent/workflows/deploy.md](.agent/workflows/deploy.md) - Deployment workflow
- [docs/development/environment-setup.md](docs/development/environment-setup.md) - Development environment details

---

*Last updated: January 10, 2026*
