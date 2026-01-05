#!/bin/bash
# =====================================================
# PolyLadder Fly.io Deployment Script
#
# Usage:
#   ./scripts/deploy-flyio.sh [--init]
#
# Options:
#   --init    First-time setup (creates app, database, secrets)
#
# Prerequisites:
#   - fly CLI installed: https://fly.io/docs/flyctl/install/
#   - fly auth login completed
# =====================================================

set -e

APP_NAME="polyladder"
DB_NAME="polyladder-db"
REGION="iad"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}INFO:${NC} $1"
}

log_success() {
    echo -e "${GREEN}SUCCESS:${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}ERROR:${NC} $1"
}

# Check if fly CLI is installed
check_fly_cli() {
    if ! command -v fly &> /dev/null; then
        log_error "fly CLI not found"
        echo "Install from: https://fly.io/docs/flyctl/install/"
        exit 1
    fi
    log_success "fly CLI found"
}

# Check if user is logged in
check_auth() {
    if ! fly auth whoami &> /dev/null; then
        log_error "Not logged in to Fly.io"
        echo "Run: fly auth login"
        exit 1
    fi
    log_success "Authenticated as $(fly auth whoami)"
}

# Initialize app (first-time setup)
init_app() {
    log_info "Initializing Fly.io deployment..."

    # Create app if doesn't exist
    if fly apps list 2>/dev/null | grep -q "$APP_NAME"; then
        log_warn "App '$APP_NAME' already exists"
    else
        log_info "Creating app '$APP_NAME'..."
        fly apps create "$APP_NAME" --org personal
        log_success "App created"
    fi

    # Create PostgreSQL database if doesn't exist
    if fly postgres list 2>/dev/null | grep -q "$DB_NAME"; then
        log_warn "Database '$DB_NAME' already exists"
    else
        log_info "Creating PostgreSQL database '$DB_NAME'..."
        fly postgres create \
            --name "$DB_NAME" \
            --region "$REGION" \
            --initial-cluster-size 1 \
            --vm-size shared-cpu-1x \
            --volume-size 1
        log_success "Database created"
    fi

    # Attach database to app
    log_info "Attaching database to app..."
    if fly postgres attach "$DB_NAME" --app "$APP_NAME" 2>/dev/null; then
        log_success "Database attached"
    else
        log_warn "Database may already be attached"
    fi

    # Generate and set secrets
    log_info "Setting secrets..."

    # Generate JWT secret if not already set
    if ! fly secrets list --app "$APP_NAME" 2>/dev/null | grep -q "JWT_SECRET"; then
        JWT_SECRET=$(openssl rand -base64 32)
        fly secrets set JWT_SECRET="$JWT_SECRET" --app "$APP_NAME"
        log_success "JWT_SECRET set"
    else
        log_warn "JWT_SECRET already set"
    fi

    # Generate JWT refresh secret if not already set
    if ! fly secrets list --app "$APP_NAME" 2>/dev/null | grep -q "JWT_REFRESH_SECRET"; then
        JWT_REFRESH_SECRET=$(openssl rand -base64 32)
        fly secrets set JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" --app "$APP_NAME"
        log_success "JWT_REFRESH_SECRET set"
    else
        log_warn "JWT_REFRESH_SECRET already set"
    fi

    log_success "Initialization complete!"
}

# Deploy application
deploy() {
    log_info "Deploying $APP_NAME to Fly.io..."

    # Check if app exists
    if ! fly apps list 2>/dev/null | grep -q "$APP_NAME"; then
        log_error "App '$APP_NAME' does not exist"
        echo "Run with --init flag for first-time setup: ./scripts/deploy-flyio.sh --init"
        exit 1
    fi

    # Deploy (without high availability for cost savings)
    fly deploy --app "$APP_NAME" --ha=false

    log_success "Deployment complete!"
    echo ""
    echo "App URL: https://$APP_NAME.fly.dev"
    echo "Dashboard: https://fly.io/apps/$APP_NAME"
    echo ""
    echo "Useful commands:"
    echo "  fly logs --app $APP_NAME          # View logs"
    echo "  fly ssh console --app $APP_NAME   # SSH into container"
    echo "  fly status --app $APP_NAME        # Check status"
}

# Main
main() {
    echo "============================================="
    echo "  PolyLadder Fly.io Deployment"
    echo "============================================="
    echo ""

    check_fly_cli
    check_auth

    if [ "$1" = "--init" ]; then
        init_app
    fi

    deploy
}

main "$@"
