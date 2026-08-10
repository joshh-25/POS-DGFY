# SKU Inventory Manager - Backend API

Backend API server for the SKU Inventory Manager system.

## Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.18+
- **ORM**: Sequelize 6.35+
- **Database**: MySQL 8.0+
- **Authentication**: JWT + bcrypt
- **Validation**: Joi 17.11+

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

3. Update `.env` with your database credentials

4. Run database migrations (separate package):
```bash
cd ../dgfy-migration-runner
npm run migrate
npm run seed   # optional, sample data
cd ../dgfy-api
```

5. Start development server:
```bash
npm run dev
```

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report
- `npm run doctor:runtime` - Verify runtime schema readiness

Migrations/seeders now live in the sibling `apps/dgfy-migration-runner` package — see its README
for `migrate`/`seed` commands.

## API Base URL

- Development: `http://localhost:5000/api/v1`
- Production: Configure via environment variables

## Project Structure

```
apps/dgfy-api/
├── src/
│   ├── config/          # Configuration files
│   ├── models/          # Sequelize models
│   ├── routes/         # Express routes
│   ├── controllers/   # Request handlers
│   ├── services/       # Business logic
│   ├── middleware/    # Custom middleware
│   ├── utils/          # Utility functions
│   └── server.js       # Entry point
├── tests/              # Test files
├── package.json
└── .env.example
```

## Documentation

See `/docs` folder in the root project for:
- API Specification: `docs/api/specification.md`
- Database Schema: `docs/database/schema.md`
- Integration Guide: `docs/api/integration-guide.md`


##  Multi-Tenancy Architecture

This project uses a **Multi-Tenant Database per Tenant** architecture, managed by a Landlord database.

### Core Concepts
*   **Landlord DB**: Stores the 	enants table (ID, Name, Domain, DB Name, Token).
*   **Tenant DB**: Isolated database for each company.
*   **Tenant Connector**: Manages connection pools dynamically.

### Authentication & Context
*   **Login**: Returns a JWT + x-company-token.
*   **API Requests**: MUST include x-company-token header to route to the correct database.
*   **Provisioning**: Master Admins can create new tenants via POST /api/v1/admin/tenants/provision.

### Setup for Development
1.  **Landlord Setup**: Runs automatically.
2.  **Tenant A**: Default dev tenant sku_test_tenant_a is created by scripts/setup-test-tenants.js.
3.  **New Tenants**: Use the Register Company UI or API.

### Troubleshooting
*   **500 Errors on new tenants?** Ensure migrations are up to date (utils/tenantProvisioningService.js handles this, or use scheduler for updates).

