#!/bin/bash

set -e

echo "🚀 Setting up PolyLadder local development environment..."

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
JWT_SECRET=dev-secret-key-must-be-at-least-32-characters-long-for-security
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=debug
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
EOF
  echo "✅ Created packages/api/.env"
else
  echo "ℹ️  packages/api/.env already exists, skipping..."
fi

# Web .env
if [ ! -f "packages/web/.env" ]; then
  cat > packages/web/.env << EOF
VITE_API_URL=http://localhost:3000/api/v1
EOF
  echo "✅ Created packages/web/.env"
else
  echo "ℹ️  packages/web/.env already exists, skipping..."
fi

# Refinement Service .env
if [ ! -f "packages/refinement-service/.env" ]; then
  cat > packages/refinement-service/.env << EOF
NODE_ENV=development
DATABASE_URL=postgres://dev:dev@localhost:5432/polyladder
LOG_LEVEL=debug
# ANTHROPIC_API_KEY=sk-ant-your-key-here
EOF
  echo "✅ Created packages/refinement-service/.env"
  echo "⚠️  Don't forget to add your ANTHROPIC_API_KEY to packages/refinement-service/.env"
else
  echo "ℹ️  packages/refinement-service/.env already exists, skipping..."
fi

# Start database
echo "🗄️  Starting database..."
docker-compose -f docker/docker-compose.yml up -d db

echo "⏳ Waiting for database to be ready..."
sleep 5

# Run migrations
echo "📊 Running database migrations..."
export DATABASE_URL="postgres://dev:dev@localhost:5432/polyladder"
pnpm --filter @polyladder/db migrate:up

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Start API server: pnpm --filter @polyladder/api dev"
echo "2. Start web app: pnpm --filter @polyladder/web dev"
echo "3. (Optional) Start refinement service: pnpm --filter @polyladder/refinement-service dev"
echo ""
echo "Create test users:"
echo "  Operator: curl -X POST http://localhost:3000/api/v1/auth/register -H 'Content-Type: application/json' -d '{\"email\":\"operator@test.com\",\"password\":\"TestPass123!\",\"role\":\"operator\"}'"
echo "  Learner: curl -X POST http://localhost:3000/api/v1/auth/register -H 'Content-Type: application/json' -d '{\"email\":\"learner@test.com\",\"password\":\"TestPass123!\"}'"

