#!/bin/bash
# Kill Port Helper Script
# Usage: ./kill-port.sh <port-number>
# Example: ./kill-port.sh 5000

PORT=$1

# Check if port number was provided
if [ -z "$PORT" ]; then
    echo "❌ Error: No port number provided"
    echo ""
    echo "Usage: ./kill-port.sh <port-number>"
    echo ""
    echo "Examples:"
    echo "  ./kill-port.sh 5000   # Kill backend"
    echo "  ./kill-port.sh 5173   # Kill frontend"
    echo "  ./kill-port.sh 6379   # Kill Redis"
    exit 1
fi

# Validate that PORT is a number
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
    echo "❌ Error: Port must be a number"
    echo "You provided: $PORT"
    exit 1
fi

echo "🔍 Searching for process on port $PORT..."

# Find the PID using the port (only LISTENING state)
PID=$(netstat -ano | grep ":$PORT" | grep "LISTENING" | awk '{print $5}' | head -1)

# Check if a process was found
if [ -z "$PID" ] || [ "$PID" = "0" ]; then
    echo "✅ Port $PORT is already free (no process found)"
    exit 0
fi

echo "📌 Found process with PID: $PID"
echo "🔪 Killing process $PID on port $PORT..."

# Kill the process
taskkill //PID $PID //F 2>&1

# Check if kill was successful
if [ $? -eq 0 ]; then
    echo "✅ Successfully killed process on port $PORT"
    echo "🎉 Port $PORT is now free!"
else
    echo "❌ Failed to kill process. You may need administrator privileges."
    exit 1
fi
