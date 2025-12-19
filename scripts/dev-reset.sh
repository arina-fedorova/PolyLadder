#!/bin/bash
set -e

echo "Stopping containers..."
pnpm dev:down

echo "Removing volumes..."
docker volume rm polyladder_postgres_data 2>/dev/null || true

echo "Rebuilding containers..."
pnpm dev:build

echo "Development environment reset complete!"

