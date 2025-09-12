#!/bin/bash

# CORA Auto-Restart Script
# Monitors and restarts servers when they crash

echo "🚀 Starting CORA with auto-restart..."

# Kill any existing servers
echo "🧹 Cleaning up existing processes..."
pkill -f "uvicorn app.main:app"
pkill -f "npm run dev"
sleep 2

# Function to restart backend
restart_backend() {
    echo "🔄 Restarting backend..."
    cd /Users/richardrierson/Desktop/Projects/CORA/backend
    python3 -m uvicorn app.main:app --reload --port 8000 &
    BACKEND_PID=$!
    echo "✅ Backend started (PID: $BACKEND_PID)"
}

# Function to restart voice server
restart_voice() {
    echo "🔄 Restarting voice server..."
    cd /Users/richardrierson/Desktop/Projects/CORA/server
    npm run dev &
    VOICE_PID=$!
    echo "✅ Voice server started (PID: $VOICE_PID)"
}

# Start servers
restart_backend
restart_voice

echo "🎯 CORA servers started!"
echo "📞 Call: +1-316-867-0416"
echo "🌐 Frontend: http://localhost:5173"
echo "💡 Press Ctrl+C to stop all servers"

# Monitor and restart on crash
while true do
    sleep 5
    
    # Check if backend crashed
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "❌ Backend crashed - restarting..."
        restart_backend
    fi
    
    # Check if voice server crashed  
    if ! kill -0 $VOICE_PID 2>/dev/null; then
        echo "❌ Voice server crashed - restarting..."
        restart_voice
    fi
done