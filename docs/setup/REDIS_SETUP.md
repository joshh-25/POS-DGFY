# Redis Setup for Windows

## Option 1: Using Memurai (Recommended for Windows)

Memurai is a Redis-compatible server for Windows.

### Steps:
1. Download Memurai from: https://www.memurai.com/get-memurai
2. Install Memurai (it will run as a Windows service)
3. The service will start automatically on port 6379
4. Your backend will automatically connect

## Option 2: Using Redis Docker Container (Easiest)

### Prerequisites:
- Install Docker Desktop for Windows: https://www.docker.com/products/docker-desktop/

### Steps:
1. Open PowerShell or Command Prompt
2. Run this command:
   ```bash
   docker run -d --name redis-sku -p 6379:6379 redis:latest
   ```
3. Redis will be running on localhost:6379
4. Your backend will automatically connect

### To stop Redis:
```bash
docker stop redis-sku
```

### To start Redis again:
```bash
docker start redis-sku
```

### To check if Redis is running:
```bash
docker ps
```

## Option 3: Using Redis on WSL

### Steps:
1. Open PowerShell as Administrator
2. Install Ubuntu on WSL:
   ```powershell
   wsl --install -d Ubuntu
   ```
3. After installation, open Ubuntu from Start menu
4. Run these commands in Ubuntu:
   ```bash
   sudo apt update
   sudo apt install redis-server -y
   sudo service redis-server start
   ```

### To start Redis in WSL (run each time you restart):
```bash
wsl sudo service redis-server start
```

## Verify Redis is Running

Once Redis is installed and running, test the connection:

### From Command Line:
```bash
redis-cli ping
```

Should return: `PONG`

### From Your Backend:
1. Restart your backend server
2. Check the logs - you should see:
   - ✅ Redis connection established successfully

## Troubleshooting

### If backend still shows Redis error:
1. Make sure Redis is running on port 6379
2. Check if port 6379 is in use: `netstat -ano | findstr :6379`
3. Restart your backend server after starting Redis

### Quick Test:
Open browser and go to: http://localhost:5000/api/health
Should show Redis status as "connected"
