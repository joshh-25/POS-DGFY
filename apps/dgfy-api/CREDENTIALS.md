# Development Environment Credentials

**⚠️ WARNING: This file contains sensitive credentials for DEVELOPMENT ONLY.**

**DO NOT use these credentials in production environments.**

---

## Database Configuration

### MySQL (XAMPP Default Settings)

- **Host:** `localhost`
- **Port:** `3306`
- **Database Name:** `SKU` (Landlord Registry) / `sku_tenant_*` (Tenant Databases)
- **Username:** `root`
- **Password:** *(empty - XAMPP default)*

### Connection String Format
```
mysql://root@localhost:3306/sku_inventory_manager
```

### Creating the Database

**IMPORTANT:** The database must be created before running migrations.

Execute the SQL script to create the database:

**Option 1: Via phpMyAdmin (Recommended for XAMPP)**
1. Open phpMyAdmin (usually at http://localhost/phpmyadmin)
2. Click on the "SQL" tab
3. Copy and paste the contents of `database-setup.sql`
4. Click "Go" to execute

**Option 2: Via MySQL CLI**
```bash
# Navigate to backend directory
cd backend

# Execute SQL script (adjust path to MySQL if needed)
mysql -u root -p < database-setup.sql
# Or if MySQL is in XAMPP path:
C:\xampp\mysql\bin\mysql.exe -u root < database-setup.sql
```

**Option 3: Manual SQL Execution**
```sql
CREATE DATABASE IF NOT EXISTS sku_inventory_manager 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;
```

---

## Application Configuration

### Server Settings
- **Environment:** `development`
- **Port:** `5000`
- **API Base URL:** `http://localhost:5000/api/v1`

### CORS Configuration
- **Allowed Origin:** `http://localhost:5173` (Frontend development server)

---

## Authentication & Security

### JWT Configuration

**Access Token:**
- **Secret:** `dev-jwt-secret-key-2024-sku-inventory-manager-change-in-production`
- **Expiry:** `24h`

**Refresh Token:**
- **Secret:** `dev-refresh-token-secret-2024-sku-inventory-manager-change-in-production`
- **Expiry:** `7d`

**⚠️ IMPORTANT:** These JWT secrets are for development only. Generate new, secure, random secrets for production.

### Test User Credentials

**Original Legacy Data (recovered):**
- **Email:** `admin@test.com`
- **Password:** `Admin123!`
- **Company Token:** `token-original`

**Test Tenant A:**
- **Email:** `admin@tenant-a.com`
- **Password:** `Admin123!`
- **Company Token:** `token-tenant-a`

**⚠️ IMPORTANT:** These credentials are for development/testing only. Do not use in production.

---

## Optional Services

### Redis (Caching)
- **URL:** `redis://localhost:6379`
- **Status:** Optional - not required for basic functionality

---

## Environment Variables Reference

All configuration is stored in `apps/dgfy-api/.env` file. The following variables are used:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `development` | Application environment |
| `PORT` | `5000` | Backend server port |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_NAME` | `sku_inventory_manager` | Database name |
| `DB_USER` | `root` | MySQL username |
| `DB_PASSWORD` | *(empty)* | MySQL password (XAMPP default) |
| `DB_DIALECT` | `mysql` | Database dialect |
| `JWT_SECRET` | *(see above)* | JWT access token secret |
| `JWT_EXPIRY` | `24h` | JWT access token expiry |
| `REFRESH_TOKEN_SECRET` | *(see above)* | JWT refresh token secret |
| `REFRESH_TOKEN_EXPIRY` | `7d` | JWT refresh token expiry |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL (optional) |
| `MOCK_PAYPAL` | `true` | Allows local E2E testing without real PayPal API calls |

---

## Security Notes

1. **Development Only:** These credentials are configured for local development with XAMPP.
2. **Production:** All secrets and passwords must be changed before deploying to production.
3. **Git:** The `.env` file is excluded from version control via `.gitignore`.
4. **XAMPP Default:** The empty password is the default for XAMPP MySQL installation.
5. **JWT Secrets:** Generate cryptographically secure random strings for production (minimum 32 characters).

---

## Next Steps

After setting up credentials:

1. **Create Database:** Run `database-setup.sql` script
2. **Run Migrations:** `npm run migrate` (creates all tables)
3. **Run Seeders:** `npm run seed` (populates initial data)
4. **Start Server:** `npm run dev` (starts backend server)

---

## Troubleshooting

### Database Connection Issues

**Problem:** Cannot connect to database
- **Solution:** Ensure MySQL is running in XAMPP Control Panel
- **Solution:** Verify database exists: `SHOW DATABASES;`
- **Solution:** Check credentials match XAMPP MySQL settings

### Port Already in Use

**Problem:** Port 5000 is already in use
- **Solution:** Change `PORT` in `.env` to an available port
- **Solution:** Stop the process using port 5000

### Migration Errors

**Problem:** Migrations fail to run
- **Solution:** Ensure database exists before running migrations
- **Solution:** Check MySQL user has CREATE TABLE permissions
- **Solution:** Verify `.env` file has correct database credentials

---

## PayPal Configuration

### Sandbox (Development)
- **Client ID:** `AV1K__XikgoDs-rYeE2TomU2FNLycOiSzwN0qhanYUor7UoPUji7gVxFMxtK-ExmJB--cy7T5gjD797M`
- **Secret:** `EO0uYnokWoxwqMyg5FkZfh9atG0xkpx08UYMmeYZ8MszcrL7AKBe_x5UDxwm3HoQsbb-lEy9KNDueqdB`
- **Use for:** Local testing, `PAYPAL_MODE=sandbox`

### Live (Production)
- **Client ID:** `AffijeC8ynhSJJt9kcGM5fuz4EB6njyZzhxXYBsiN3WbcxCnoF9-wgoNK9NsxU4_MfkZ0-Xia49MzXPP`
- **Secret:** `EEcSA9eJDJLkKKXqW092zJF96cw2k7M8z2Z7MFKU9u7uV4ERpeKCUyQjlZEbpMCYCc7jKQLaFOKxWZZJ`
- **Use for:** Real payments, `PAYPAL_MODE=live`

### Development Mocking
When `MOCK_PAYPAL=true` is set in the backend `.env`:
- **Registration**: The frontend (in DEV mode) shows a **[DEV ONLY] Mock Premium Payment** button.
- **Verification**: The backend bypasses the PayPal API and treats all subscription IDs as `ACTIVE`.
- **Purpose**: Fast E2E testing of the Premium lifecycle (provisioning, auto-login, feature unlocking).

---


**Last Updated:** 2026-02-11  
**Environment:** Development & Production  
**Status:** Active

---

## 🚀 Production Server Deployment (Critical)

**IMPORTANT:** `.env` files are **NOT** tracked by Git (for security). When deploying to production, you must manually update the `.env` files on the server to reflect the Live credentials.

### How to Update Production Secrets:
1.  **SSH into the server:** `ssh root@hermes-cloud`
2.  **Navigate to the project:** `cd /var/www/skupervisor`
3.  **Edit Frontend Secrets:** 
    ```bash
    nano frontend/.env
    # Update VITE_PAYPAL_CLIENT_ID and VITE_PAYPAL_PLAN_ID with Live values
    ```
4.  **Edit Backend Secrets:**
    ```bash
    nano apps/dgfy-api/.env
    # Update PAYPAL_MODE=live, PAYPAL_CLIENT_ID, and PAYPAL_CLIENT_SECRET
    ```
5.  **Re-deploy:** `bash scripts/deploy.sh` (This rebuilds the frontend with the new IDs)


