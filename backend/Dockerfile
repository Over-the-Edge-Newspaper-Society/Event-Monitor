# syntax=docker/dockerfile:1.7

FROM python:3.11-slim AS base
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    libssl-dev \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend /app

# Install Node dependencies for Apify runner
RUN npm --prefix app/utils/apify_node_runner install --omit=dev

# Ensure static and data directories exist and are writable
RUN mkdir -p /data app/static/images app/instaloader_session \
    && chown -R www-data:www-data /app /data

USER www-data

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
