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
*   **FIFO Batch Tracking**: Manage inventory using exact-cost First-In-First-Out logic.
*   **Smart Restock**: Auto-calculate min thresholds (40%) and purchase allowances (20%).
*   **Nested Products**: Create multi-level recipes (Product A can be an ingredient for Product B).
*   **Job Orders**: Production workflow with ingredient reservation and finished goods tracking.
*   **Job Order Notes**: Add detailed notes and attachments to job orders.
*   **Purchase Orders**: Complete procurement cycle from drafted POs to received stock.
*   **Stock Movements**: Detailed audit trail of every inventory change.
*   **Supplier Management**: Track supplier performance and lead times.
*   **User Management**: Role-based access control (Admin, Manager, Staff).

### Project Structure

The project is organized as a monorepo:

*   **`frontend/`**: React application (Vite + TailwindCSS + Shadcn UI).
*   **`backend/`**: Node.js Express API (Sequelize + MySQL).
*   **`docs/`**: Detailed documentation and quick references.

## 📚 Documentation

- **[PREREQUISITES.md](PREREQUISITES.md)** - Prerequisites for local & hosting server environments
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common errors and solutions guide
- **[SETUP.md](SETUP.md)** - Complete local setup instructions
- **[ADMIN_SETUP.md](ADMIN_SETUP.md)** - Admin user setup
- **[REDIS_SETUP.md](REDIS_SETUP.md)** - Redis installation and configuration
- **[spec-kit/](spec-kit/)** - Full technical specifications

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

- **Admin User**:
  - Username: `admin`
  - Password: `Admin@123`

See [backend/CREDENTIALS.md](backend/CREDENTIALS.md) for more details.

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 5173 in use | `lsof -ti:5173 \| xargs kill -9` |
| Port 5000 in use | `lsof -ti:5000 \| xargs kill -9` |
| Frontend can't reach backend | Check CORS in `backend/src/server.js` |
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
