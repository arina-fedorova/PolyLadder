#!/bin/bash
# =====================================================
# PolyLadder Fly.io Migration Runner
#
# Usage:
#   ./scripts/flyio-migrate.sh [up|down|status]
#
# Commands:
#   up      Run pending migrations (default)
#   down    Rollback last migration
#   status  Show migration status
#
# Prerequisites:
#   - fly CLI installed
#   - App deployed to Fly.io
# =====================================================

set -e

APP_NAME="polyladder"
COMMAND="${1:-up}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}INFO:${NC} $1"
}

log_success() {
    echo -e "${GREEN}SUCCESS:${NC} $1"
}

log_error() {
    echo -e "${RED}ERROR:${NC} $1"
}

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    log_error "fly CLI not found"
    echo "Install from: https://fly.io/docs/flyctl/install/"
    exit 1
fi

# Check if app exists
if ! fly apps list 2>/dev/null | grep -q "$APP_NAME"; then
    log_error "App '$APP_NAME' not found on Fly.io"
    echo "Deploy first with: ./scripts/deploy-flyio.sh --init"
    exit 1
fi

# Check if machine is running
log_info "Checking machine status..."
MACHINE_STATUS=$(fly status --app "$APP_NAME" 2>/dev/null | grep -E "^[a-z0-9]+\s+" | head -1 || echo "")

if [ -z "$MACHINE_STATUS" ]; then
    log_info "No machines running. Starting a machine..."
    fly machine start --app "$APP_NAME" 2>/dev/null || true
    sleep 5
fi

case "$COMMAND" in
    up)
        log_info "Running pending migrations..."
        fly ssh console --app "$APP_NAME" -C "cd /app && node packages/db/dist/migrate.js up"
        log_success "Migrations complete"
        ;;
    down)
        log_info "Rolling back last migration..."
        fly ssh console --app "$APP_NAME" -C "cd /app && node packages/db/dist/migrate.js down"
        log_success "Rollback complete"
        ;;
    status)
        log_info "Checking migration status..."
        fly ssh console --app "$APP_NAME" -C "cd /app && node packages/db/dist/migrate.js status"
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        echo "Usage: $0 [up|down|status]"
        exit 1
        ;;
esac
