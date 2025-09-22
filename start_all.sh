#!/bin/bash

# Start both backend and frontend services

echo "Starting Event Monitor Application..."

# Function to cleanup on exit
cleanup() {
    echo -e "\nShutting down services..."
    kill $(jobs -p) 2>/dev/null
    exit
}

# Set up trap to cleanup on Ctrl+C
trap cleanup INT

# Start backend in background
echo "Starting backend server..."
./start_backend.sh &
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 3

# Start frontend in background
echo "Starting frontend server..."
./start_frontend.sh &
FRONTEND_PID=$!

echo -e "\n================================"
echo "Event Monitor is running!"
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "API Docs: http://localhost:8000/docs"
echo -e "================================\n"
echo "Press Ctrl+C to stop all services"

# Wait for both processes
wait