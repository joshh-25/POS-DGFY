# SKU Inventory Manager

A comprehensive full-stack inventory management system for SKU tracking, purchase orders, job orders, and stock movements with FIFO batch tracking.

## 🏗️ Project Structure (Monorepo)

This project is organized as a monorepo with separate frontend and backend applications:

```
SKU-Inventory-Manager/
├── frontend/          # React + Vite frontend application
├── backend/           # Node.js + Express backend API
├── docs/              # Documentation
├── spec-kit/          # Full technical specifications
├── .claude/           # Claude Code configuration
├── package.json       # Root monorepo package.json
└── docker-compose.yml # Docker orchestration
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- MySQL 8.0
- Redis 7.x (optional, for caching)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd SKU-Inventory-Manager
   ```

2. **Install all dependencies**
   ```bash
   npm run install:all
   ```
   This will install dependencies for root, frontend, and backend.

3. **Setup Backend Environment**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your MySQL and Redis credentials
   ```

4. **Setup Database**
   ```bash
   cd backend
   npm run setup:db -- --seed
   ```

### Development

**Start both frontend and backend concurrently:**
```bash
npm run dev
```

**Or start individually:**
```bash
# Frontend only (http://localhost:5173)
npm run dev:frontend

# Backend only (http://localhost:5000)
npm run dev:backend
```

### Using Docker

```bash
# Start all services (MySQL, Redis, Backend, Frontend)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## 📁 Frontend (`frontend/`)

- **Framework**: React 18 + Vite
- **Styling**: TailwindCSS + Shadcn UI
- **Routing**: React Router v6
- **State**: Component-level + Zustand stores
- **Port**: 5173 (development)

### Frontend Structure
```
frontend/
├── Components/        # React components by feature
│   ├── dashboard/
│   ├── items/
│   ├── po/           # Purchase Orders
│   ├── jo/           # Job Orders
│   ├── movements/
│   ├── products/
│   ├── suppliers/
│   ├── users/
│   └── ui/           # Shadcn UI components
├── Pages/            # Page components
├── Entities/         # Frontend data models
├── src/
│   ├── services/     # API integration layer
│   └── store/        # Zustand stores
└── package.json
```

## 🔧 Backend (`backend/`)

- **Framework**: Node.js + Express
- **ORM**: Sequelize
- **Database**: MySQL 8.0
- **Cache**: Redis
- **Auth**: JWT + Bcrypt
- **Port**: 5000 (development)
- **Port**: 5001 (production)

### Backend Structure
```
backend/
├── src/
│   ├── routes/        # Express routes
│   ├── controllers/   # Business logic
│   ├── models/        # Sequelize models
│   ├── middleware/    # Auth & validation
│   ├── services/      # Complex operations
│   ├── validators/    # Input validation
│   ├── seeders/       # Database seeders
│   └── server.js      # Entry point
├── .env              # Environment variables
└── package.json
```

### Key Features

*   **Inventory Management**: Track stock levels, costs, and specifications.
*   **AI Document Parsing**: Automatically extract text from PDF and Word documents for AI context.
*   **AI Vision Support**: Analyze uploaded images using OpenAI Vision API.
*   **FIFO Batch Tracking**: Manage inventory using exact-cost First-In-First-Out logic.
*   **Smart Restock**: Auto-calculate min thresholds (40%) and purchase allowances (20%).
*   **Nested Products**: Create multi-level recipes (Product A can be an ingredient for Product B).
*   **Job Orders**: Production workflow with ingredient reservation and finished goods tracking.
*   **Job Order Notes**: Add detailed notes and attachments to job orders.
*   **Purchase Orders**: Complete procurement cycle from drafted POs to received stock.
*   **PO Wizard Supplier Validation**: Blocks and warns users when selected items have no supplier assigned.
*   **Item-Supplier Coverage Panel**: Visual dashboard on Suppliers page showing which items have/lack supplier assignments.
*   **Stock Movements**: Real-time tracking of inventory ins/outs with audit logs.
*   **Admin Feedback Dashboard**: Secure, hidden portal for developers to review bug reports and suggestions.
*   **Interactive Reports**: Custom date filtering and CSV export for business intelligence.
*   **Supplier Management**: Track supplier performance, lead times, and item assignments with quick-assign functionality.
*   **User Management**: Role-based access control (Admin, Manager, Staff).
*   **Multi-Tenancy**: Distributed database architecture with unique subdomains and tokens for each company.
*   **Legacy Data Support**: Restoration support for original standalone databases.

### Project Structure

The project is organized as a monorepo:

*   **`frontend/`**: React application (Vite + TailwindCSS + Shadcn UI).
*   **`backend/`**: Node.js Express API (Sequelize + MySQL).
*   **`docs/`**: Detailed documentation and quick references.

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [QUICK_START.md](QUICK_START.md) | Fast setup guide |
| [SETUP.md](SETUP.md) | Detailed setup |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Error solutions |
| [docs/reference/QUICK_REFERENCE.md](docs/reference/QUICK_REFERENCE.md) | Commands cheatsheet |
| [docs/setup/REDIS_SETUP.md](docs/setup/REDIS_SETUP.md) | Redis configuration |
| [docs/guides/SCRIPTS_GUIDE.md](docs/guides/SCRIPTS_GUIDE.md) | Helper scripts |

See [docs/README.md](docs/README.md) for the complete documentation index.

## 🛠️ Available Scripts

### Root Level
```bash
npm run dev              # Start both frontend & backend
npm run dev:frontend     # Start frontend only
npm run dev:backend      # Start backend only
npm run build            # Build both applications
npm run install:all      # Install all dependencies
npm run start            # Start production builds
```

### 🤖 Agentic Workflows (Antigravity Only)
If you are using the Antigravity AI assistant, you can use these "Turbo" workflows to automate multi-step tasks:

- `/deploy` - Full production deployment (SSH, pull, build, restart)
- `/start-dev` - Start development environment with PM2
- `/sync` - Synchronize all dependencies (root, frontend, backend)
- `/health` - Quick system health and status check
- `/fix` - Automatically fix linting and formatting issues

These workflows use `// turbo-all` to run autonomously without requiring step-by-step approval.

### Frontend (`cd frontend/`)
```bash
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build
npm run lint             # Lint code
```

### Backend (`cd backend/`)
```bash
npm run dev              # Start dev server with nodemon
npm start                # Start production server
npm run db:setup         # Run migrations & seeders
npm test                 # Run tests
```

## 🔐 Default Credentials

After running the seeders, you can log in with:

- **Admin User (Tenant A)**:
  - Username: `admin`
  - Password: `Admin@123`
  - Token: `token-tenant-a`

- **Original Legacy Data (recovered)**:
  - Email: `admin@test.com`
  - Password: `Admin123!`
  - Token: `token-original`

See [backend/CREDENTIALS.md](backend/CREDENTIALS.md) for more details.

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 5173 in use | `lsof -ti:5173 \| xargs kill -9` |
| Port 5000 in use | `lsof -ti:5000 \| xargs kill -9` |
| Frontend can't reach backend | Check CORS in `backend/src/server.js` |
| Registration fails (500) | Ensure `TRUST_PROXY=true` is set ONLY if behind a proxy |
| Backend won't start | Verify `.env` exists in `backend/` |
| Database connection error | Check MySQL is running, verify credentials |
| Dependencies not installing | Run `npm run install:all` from root |

## 🤝 Contributing

1. Create a feature branch
2. Make your changes in either `frontend/` or `backend/`
3. Test thoroughly
4. Commit your changes
5. Push and create a pull request

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with React, Express, and Sequelize
- UI components from Shadcn UI
- Icons from Lucide React
- Styled with TailwindCSS

---

For more detailed information, refer to the [CLAUDE.md](CLAUDE.md) file or the [spec-kit/](spec-kit/) directory.
