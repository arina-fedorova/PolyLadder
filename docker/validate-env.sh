#!/bin/sh
# =====================================================
# PolyLadder Production Environment Validator
#
# Validates required environment variables before
# starting Docker containers. Run this script before
# docker compose up to get helpful error messages.
#
# Usage:
#   ./docker/validate-env.sh [.env.prod]
# =====================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default env file
ENV_FILE="${1:-.env.prod}"

echo "Validating production environment variables..."
echo ""

# Track if any validation fails
ERRORS=0

# Function to check if variable is set and not empty
check_required() {
    VAR_NAME="$1"
    VAR_VALUE="$2"

    if [ -z "$VAR_VALUE" ]; then
        echo "${RED}ERROR:${NC} $VAR_NAME is required but not set"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
    echo "${GREEN}OK:${NC} $VAR_NAME is set"
    return 0
}

# Function to check minimum length
check_min_length() {
    VAR_NAME="$1"
    VAR_VALUE="$2"
    MIN_LENGTH="$3"

    if [ -z "$VAR_VALUE" ]; then
        return 0  # Skip if not set (will be caught by check_required)
    fi

    ACTUAL_LENGTH=$(printf '%s' "$VAR_VALUE" | wc -c)
    if [ "$ACTUAL_LENGTH" -lt "$MIN_LENGTH" ]; then
        echo "${RED}ERROR:${NC} $VAR_NAME must be at least $MIN_LENGTH characters (got $ACTUAL_LENGTH)"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
    return 0
}

# Function to check if value is a valid URL-like string
check_not_placeholder() {
    VAR_NAME="$1"
    VAR_VALUE="$2"

    case "$VAR_VALUE" in
        *CHANGE_ME*|*changeme*|*example*|*YOUR_*|*your_*)
            echo "${YELLOW}WARNING:${NC} $VAR_NAME appears to contain a placeholder value"
            ;;
    esac
    return 0
}

# Load env file if it exists
if [ -f "$ENV_FILE" ]; then
    echo "Loading environment from: $ENV_FILE"
    echo ""
    # Export variables from env file
    set -a
    . "$ENV_FILE"
    set +a
else
    echo "${YELLOW}WARNING:${NC} Environment file '$ENV_FILE' not found"
    echo "Using current environment variables"
    echo ""
fi

# =====================================================
# Required Variables
# =====================================================
echo "Checking required variables..."
echo ""

check_required "POSTGRES_DB" "$POSTGRES_DB"
check_required "POSTGRES_USER" "$POSTGRES_USER"
check_required "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
check_required "JWT_SECRET" "$JWT_SECRET"

# =====================================================
# Security Checks
# =====================================================
echo ""
echo "Running security checks..."
echo ""

# JWT_SECRET must be at least 32 characters
check_min_length "JWT_SECRET" "$JWT_SECRET" 32

# Check for placeholder values
check_not_placeholder "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
check_not_placeholder "JWT_SECRET" "$JWT_SECRET"
check_not_placeholder "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET"

# =====================================================
# Optional Variables with Defaults
# =====================================================
echo ""
echo "Optional variables (with defaults):"
echo "  API_PORT=${API_PORT:-3000}"
echo "  LOG_LEVEL=${LOG_LEVEL:-info}"
echo "  TAG=${TAG:-latest}"

# =====================================================
# Summary
# =====================================================
echo ""
if [ "$ERRORS" -gt 0 ]; then
    echo "${RED}Validation failed with $ERRORS error(s)${NC}"
    echo ""
    echo "Please fix the errors above and try again."
    echo "See docker/.env.prod.example for required variables."
    exit 1
else
    echo "${GREEN}All environment variables validated successfully!${NC}"
    echo ""
    echo "You can now start the production containers with:"
    echo "  docker compose -f docker/docker-compose.prod.yml up -d"
    exit 0
fi
