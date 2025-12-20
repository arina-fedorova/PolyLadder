#!/bin/bash

# Script to setup E2E testing environment
# This can be run manually before running E2E tests locally

set -e

echo "🚀 Setting up E2E test environment..."

# Start E2E database
echo "📦 Starting PostgreSQL container..."
docker compose -f docker/docker-compose.e2e.yml up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 5

# Run migrations
echo "🔧 Running database migrations..."
DATABASE_URL=postgres://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e \
  pnpm --filter @polyladder/db migrate up

echo "✨ E2E environment ready! You can now run: pnpm test:e2e"

