#!/bin/bash

# Start the React frontend

echo "Starting Event Monitor Frontend..."

cd frontend

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# Start the development server
echo "Starting frontend on http://localhost:5173"
npm run dev