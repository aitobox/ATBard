# Multi-stage build for frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Python Django backend run stage
FROM python:3.12-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install them
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend codebase and the built frontend folder
COPY . .
COPY --from=frontend-builder /app/dist ./dist

# Expose Django port
EXPOSE 3000

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=backend.settings

# Run DB migration and start server
CMD python manage.py migrate && python manage.py runserver 0.0.0.0:3000
