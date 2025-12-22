#!/bin/bash

set -e

echo "🚀 Setting up PolyLadder development environment..."

# Check prerequisites
echo "📋 Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm is required but not installed. Aborting." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Node.js version 20+ is required. Current: $(node -v)"
  exit 1
fi

echo "✅ Prerequisites check passed"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Setup environment files
echo "⚙️  Setting up environment files..."

# API .env
if [ ! -f "packages/api/.env" ]; then
  cat > packages/api/.env << EOF
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgres://dev:dev@localhost:5432/polyladder
JWT_SECRET=dev-secret-key-must-be-at-least-32-characters-long-for-development
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=debug
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
APP_VERSION=0.1.0
EOF
  echo "✅ Created packages/api/.env"
else
  echo "ℹ️  packages/api/.env already exists, skipping"
fi

# Web .env
if [ ! -f "packages/web/.env" ]; then
  cat > packages/web/.env << EOF
VITE_API_URL=http://localhost:3000/api/v1
EOF
  echo "✅ Created packages/web/.env"
else
  echo "ℹ️  packages/web/.env already exists, skipping"
fi

# Start database
echo "🗄️  Starting database..."
docker-compose -f docker/docker-compose.yml up -d db

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 5
until docker exec polyladder-db-dev pg_isready -U dev -d polyladder > /dev/null 2>&1; do
  echo "   Waiting for database..."
  sleep 2
done
echo "✅ Database is ready"

# Run migrations
echo "🔄 Running database migrations..."
pnpm --filter @polyladder/db migrate:up

echo ""
echo "✅ Development environment setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start API server:    cd packages/api && pnpm dev"
echo "  2. Start web app:       cd packages/web && pnpm dev"
echo "  3. Open browser:        http://localhost:5173"
echo ""
echo "To stop database:"
echo "  docker-compose -f docker/docker-compose.yml down"

