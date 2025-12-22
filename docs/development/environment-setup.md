# Development Environment Setup

This guide covers setting up the development environment for the SKU Inventory Manager project.

---

## Prerequisites

- Node.js 18+ and npm
- MySQL 8.0+
- Redis 7.0+
- Docker (optional)
- Git

---

## Local Development Setup

```bash
# Clone repository
git clone <repo-url>
cd sku-inventory-manager

# Install backend dependencies
cd backend
npm install

# Create .env file
cp .env.example .env

# Configure database
# Edit .env with your MySQL credentials

# Run migrations
npm run migrate

# Seed initial data
npm run seed

# Start backend server
npm run dev

# In another terminal, start frontend
cd ../frontend
npm install
npm run dev
```

---

## Environment Variables

### Backend (.env)

```
NODE_ENV=development
PORT=5000
DATABASE_URL=mysql://user:password@localhost:3306/sku_inventory_manager
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=24h
REFRESH_TOKEN_SECRET=your-refresh-secret
REFRESH_TOKEN_EXPIRY=7d
REDIS_URL=redis://localhost:6379
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
S3_BUCKET=sku-inventory-uploads
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Frontend (.env)

```
REACT_APP_API_URL=http://localhost:5000/api/v1
REACT_APP_SOCKET_URL=http://localhost:5000
REACT_APP_ENV=development
REACT_APP_LOG_LEVEL=debug
```

---

## Database Setup

### Initial Schema Creation

Refer to [Database Schema](../database/schema.md) for complete schema details.

### Running Migrations

```bash
# Run all pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# Reset all migrations (development only)
npm run migrate:reset
```

### Seeding Data

```bash
# Seed initial data
npm run seed

# Seed specific data
npm run seed:users
npm run seed:items
```

---

## Redis Setup

### Local Redis Installation

**macOS (Homebrew):**
```bash
brew install redis
brew services start redis
```

**Linux:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

**Windows:**
- Download from https://redis.io/download
- Or use Docker: `docker run -d -p 6379:6379 redis`

### Verify Redis Connection

```bash
redis-cli ping
# Should return: PONG
```

---

## Docker Setup (Optional)

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: sku_inventory_manager
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  mysql_data:
```

### Running with Docker

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
```

---

## Troubleshooting

### Common Issues

**Port Already in Use:**
```bash
# Find process using port
lsof -i :5000  # macOS/Linux
netstat -ano | findstr :5000  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

**Database Connection Failed:**
- Verify MySQL is running
- Check credentials in `.env`
- Ensure database exists
- Check firewall settings

**Redis Connection Failed:**
- Verify Redis is running: `redis-cli ping`
- Check Redis URL in `.env`
- Ensure port 6379 is not blocked

**Migration Errors:**
- Ensure database exists
- Check user permissions
- Verify connection string format
- Review migration files for syntax errors

---

## IDE Setup

### Recommended Extensions

**VS Code:**
- ESLint
- Prettier
- MySQL
- Docker
- GitLens

### Editor Configuration

Create `.editorconfig`:
```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

---

## Next Steps

After setting up the environment:

1. Review [Development Roadmap](./roadmap.md) for project phases
2. Read [Development Guidelines](./guidelines.md) for coding standards
3. Check [API Specification](../api/specification.md) for API details
4. Review [Database Schema](../database/schema.md) for data structure

