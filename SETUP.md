# SKU Inventory Manager - Setup Guide

This guide will help you set up and run the SKU Inventory Manager project locally.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **MySQL** 8.0+ ([Download](https://dev.mysql.com/downloads/mysql/))
- **npm** (comes with Node.js) or **yarn**
- **Git** (for cloning the repository)

## Quick Start (Option 1: Using Docker)

If you have Docker installed, this is the easiest way to run the entire stack:

```bash
# Start all services (MySQL, Redis, Backend, Frontend)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

The application will be available at:
- Frontend: http://localhost:80
- Backend API: http://localhost:5000/api/v1

## Manual Setup (Option 2: Local Development)

### Step 1: Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Copy the example environment file and configure it:
   ```bash
   cp .env.example .env
   ```
   
   Edit the `.env` file with your configuration:
   - Update `DB_PASSWORD` with your MySQL password
   - Update `JWT_SECRET` and `REFRESH_TOKEN_SECRET` with secure random strings
   - Adjust other settings as needed
   
   **Required Environment Variables:**
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - Database configuration
   - `JWT_SECRET`, `REFRESH_TOKEN_SECRET` - JWT token secrets (use strong random strings)
   - `CORS_ORIGIN` - Frontend URL for CORS
   
   **Optional Environment Variables:**
   - `REDIS_URL` - Redis connection URL (for caching, optional)
   - `RATE_LIMIT_*` - Rate limiting configuration
   - `LOG_LEVEL` - Logging level (info, debug, error, etc.)

4. **Start MySQL Server**
   - Make sure MySQL is running on your system
   - Default port: 3306

5. **Initialize Database**
   
   **Option A: Automated Setup (Recommended)**
   ```bash
   npm run setup:db
   ```
   This script will:
   - Check if the database exists, create it if needed
   - Run all migrations to create tables
   - Optionally run seeders (use `npm run setup:db -- --seed`)
   
   **Option B: Manual Setup**
   ```bash
   # Create database manually
   mysql -u root -p
   CREATE DATABASE sku_inventory_manager;
   
   # Run migrations
   npm run migrate
   
   # Run seeders (optional)
   npm run seed
   ```

6. **Start the backend server**
   ```bash
   npm run dev
   ```
   The backend will start on `http://localhost:5000`

### Step 3: Frontend Setup

1. **Navigate to project root** (if not already there)
   ```bash
   cd ..
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables (Optional)**
   
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   
   Edit the `.env` file if needed (defaults work for local development):
   ```env
   VITE_API_URL=http://localhost:5000/api/v1
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```
   The frontend will start on `http://localhost:5173`

## Running the Application

### Development Mode

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

### Production Mode

**Backend:**
```bash
cd backend
npm start
```

**Frontend:**
```bash
npm run build
npm run preview
```

## Accessing the Application

Once both servers are running:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000/api/v1
- **Health Check**: http://localhost:5000/health (includes database and Redis status)

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `POST /api/v1/auth/logout` - Logout

### Items
- `GET /api/v1/items` - Get all items
- `GET /api/v1/items/:item_id` - Get item by ID
- `POST /api/v1/items` - Create new item
- `PUT /api/v1/items/:item_id` - Update item
- `DELETE /api/v1/items/:item_id` - Delete item

### Other Endpoints
See `docs/api/specification.md` for complete API documentation.

## Troubleshooting

### Backend Issues

**Database Connection Error:**
- Verify MySQL is running: `mysql -u root -p`
- Check database credentials in `.env`
- Ensure database exists: `CREATE DATABASE sku_inventory_manager;`

**Port Already in Use:**
- Change `PORT` in backend `.env` file
- Or stop the process using port 5000

**Migration Errors:**
- Ensure database exists or run `npm run setup:db`
- Use `npm run migrate:undo` to rollback last migration
- Check MySQL user has CREATE TABLE permissions
- Verify database credentials in `.env` file

**Database Setup Script Errors:**
- Ensure MySQL server is running
- Verify database credentials in `.env` file
- Check MySQL user has CREATE DATABASE permissions
- For manual setup, see "Manual Database Operations" section

### Frontend Issues

**API Connection Error:**
- Verify backend is running on port 5000
- Check `VITE_API_URL` in `.env` matches backend URL
- Check browser console for CORS errors

**Build Errors:**
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`

## Database Management

### Automated Database Setup
```bash
cd backend

# Setup database (creates DB if needed, runs migrations)
npm run setup:db

# Setup database with seeders
npm run setup:db -- --seed

# Reset database (development only - drops and recreates)
npm run reset:db

# Reset database without confirmation (use with caution)
npm run reset:db -- --force

# Reset database without seeders
npm run reset:db -- --no-seed
```

### Manual Database Operations

**Run Migrations**
```bash
cd backend
npm run migrate
```

**Rollback Last Migration**
```bash
npm run migrate:undo
```

**Create New Migration**
```bash
npm run migrate:create -- --name migration_name
```

**Run Seeders**
```bash
npm run seed
```

### Viewing Logs
```bash
cd backend

# View combined logs (real-time)
npm run logs:view

# Or manually view log files
cat logs/combined.log
cat logs/error.log
```

## Project Structure

```
SKU-Inventory-Manager/
├── backend/              # Backend API (Node.js/Express)
│   ├── src/
│   │   ├── config/      # Database & app configuration
│   │   ├── models/      # Sequelize models
│   │   ├── migrations/  # Database migrations
│   │   ├── routes/      # API routes
│   │   ├── controllers/ # Request handlers
│   │   ├── services/    # Business logic
│   │   └── server.js    # Entry point
│   └── package.json
├── src/                 # Frontend (React/Vite)
│   ├── services/        # API service layer
│   ├── hooks/           # React hooks
│   ├── store/           # State management (Zustand)
│   └── main.jsx         # Entry point
└── package.json
```

## Next Steps

1. **Create your first user** via the registration endpoint
2. **Explore the API** using the health check endpoint
3. **Read the documentation** in `/docs` folder
4. **Check the API specification** at `docs/api/specification.md`

## Need Help?

- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common errors
- See [PREREQUISITES.md](PREREQUISITES.md) for local vs hosting setup
- Check the documentation in `/docs`
- Review the API specification at `docs/api/specification.md`
- Check the database schema at `docs/database/schema.md`
