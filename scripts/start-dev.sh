#!/bin/bash
# PolyLadder Development Environment Startup Script

set -e

echo "🚀 Starting PolyLadder Development Environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker."
    exit 1
fi

# Stop and remove existing containers
echo "🧹 Cleaning up existing containers..."
docker-compose -f docker/docker-compose.yml down 2>/dev/null || true

# Check if port 5432 is already in use
if lsof -Pi :5432 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port 5432 is already in use. Stopping existing PostgreSQL container..."
    docker stop polyladder-db-dev 2>/dev/null || true
    docker rm polyladder-db-dev 2>/dev/null || true
    sleep 2
fi

# Start database
echo "🐳 Starting Docker containers..."
docker-compose -f docker/docker-compose.yml up -d db

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker exec polyladder-db-dev pg_isready -U dev -d polyladder > /dev/null 2>&1; then
        echo "✅ Database is ready!"
        break
    fi
    attempt=$((attempt + 1))
    echo "   Attempt $attempt/$max_attempts..."
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ Database failed to start. Check logs with: docker-compose -f docker/docker-compose.yml logs db"
    exit 1
fi

# Run migrations
echo "📦 Running database migrations..."
export DATABASE_URL="postgres://dev:dev@localhost:5432/polyladder"
export NODE_ENV="development"
pnpm --filter @polyladder/db migrate:up || echo "⚠️  Migration failed, but continuing..."

# Start all services
echo "🚀 Starting all services (API, Refinement, Web)..."
docker-compose -f docker/docker-compose.yml up -d

# Wait a bit for services to start
sleep 5

# Show status
echo ""
echo "📊 Service Status:"
docker-compose -f docker/docker-compose.yml ps

echo ""
echo "✅ Development environment is ready!"
echo ""
echo "📍 Services:"
echo "   • API:        http://localhost:3000"
echo "   • Web:        http://localhost:5173"
echo "   • Database:   localhost:5432"
echo ""
echo "📝 Useful commands:"
echo "   • View logs:    docker-compose -f docker/docker-compose.yml logs -f"
echo "   • Stop all:     docker-compose -f docker/docker-compose.yml down"
echo "   • Restart:      docker-compose -f docker/docker-compose.yml restart"
echo ""

