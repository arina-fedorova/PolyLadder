#!/bin/bash
set -e

echo "🚀 Starting test database..."
docker-compose -f docker/docker-compose.test.yml up -d --wait

echo "⏳ Waiting for database to be ready..."
sleep 3

export DATABASE_URL="postgres://test:test@localhost:5433/polyladder_test"
export JWT_SECRET="test-secret-key-that-is-at-least-32-characters-long"
export FRONTEND_URL="http://localhost:5173"
export NODE_ENV="test"

echo "📦 Running migrations..."
pnpm --filter @polyladder/db migrate up

echo "🧪 Running unit tests..."
pnpm test

echo "🔗 Running integration tests..."
pnpm test:integration

echo "✅ All tests passed!"

echo "🧹 Cleaning up..."
docker-compose -f docker/docker-compose.test.yml down -v

echo "🎉 Done!"

