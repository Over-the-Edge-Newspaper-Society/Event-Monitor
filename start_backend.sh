#!/bin/bash

# Start the FastAPI backend server

echo "Starting Event Monitor Backend..."

cd backend

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi

# Start the server
echo "Starting server on http://localhost:8000"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload