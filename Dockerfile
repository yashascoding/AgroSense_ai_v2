# Build stage for frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json bun.lockb* ./
COPY . .

RUN npm install && npm run build

# Runtime stage
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    mysql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend from previous stage (optional if your backend serves it)
COPY --from=frontend-builder /app/dist ./dist

# Expose port (Railway will use PORT env var at runtime)
EXPOSE 5000

# Run the backend
CMD ["python", "backend/app.py"]
