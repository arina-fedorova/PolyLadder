#!/bin/bash

# Script to teardown E2E testing environment

set -e

echo "🧹 Cleaning up E2E test environment..."

# Stop and remove database container
echo "🗑️  Stopping PostgreSQL container..."
docker compose -f docker/docker-compose.e2e.yml down -v

echo "✨ E2E environment cleaned up!"

