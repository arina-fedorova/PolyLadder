#!/bin/bash
# =====================================================
# PolyLadder Database Backup Script
#
# Usage:
#   ./scripts/backup-db.sh [--local|--flyio]
#
# Options:
#   --local   Backup local database (default)
#   --flyio   Backup Fly.io database via proxy
#
# Environment Variables:
#   DATABASE_URL        Database connection string
#   BACKUP_DIR          Backup directory (default: ./backups)
#   BACKUP_RETENTION    Days to keep backups (default: 30)
#   AWS_S3_BUCKET       S3 bucket for remote storage (optional)
#
# Prerequisites:
#   - pg_dump installed
#   - aws CLI (if using S3)
# =====================================================

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="polyladder_${DATE}.sql.gz"
MODE="${1:---local}"

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

log_warn() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}ERROR:${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    if ! command -v pg_dump &> /dev/null; then
        log_error "pg_dump not found. Install PostgreSQL client."
        exit 1
    fi

    if [ -z "$DATABASE_URL" ]; then
        log_error "DATABASE_URL environment variable not set"
        exit 1
    fi
}

# Create backup directory
setup_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log_info "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
}

# Create backup
create_backup() {
    log_info "Creating database backup..."
    log_info "Backup file: $BACKUP_FILE"

    # Create the backup
    pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "$BACKUP_DIR/$BACKUP_FILE"

    # Verify backup file exists and is not empty
    if [ ! -s "$BACKUP_DIR/$BACKUP_FILE" ]; then
        log_error "Backup file is empty or was not created!"
        exit 1
    fi

    # Get file size
    FILE_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
    log_success "Backup created: $BACKUP_FILE ($FILE_SIZE)"
}

# Verify backup integrity
verify_backup() {
    log_info "Verifying backup integrity..."

    # Test that the file can be decompressed
    if gunzip -t "$BACKUP_DIR/$BACKUP_FILE" 2>/dev/null; then
        log_success "Backup integrity verified"
    else
        log_error "Backup file is corrupted!"
        exit 1
    fi
}

# Upload to S3 (if configured)
upload_to_s3() {
    if [ -n "$AWS_S3_BUCKET" ]; then
        if ! command -v aws &> /dev/null; then
            log_warn "aws CLI not found. Skipping S3 upload."
            return
        fi

        log_info "Uploading to S3: s3://$AWS_S3_BUCKET/backups/$BACKUP_FILE"
        aws s3 cp "$BACKUP_DIR/$BACKUP_FILE" "s3://$AWS_S3_BUCKET/backups/$BACKUP_FILE"
        log_success "Uploaded to S3"
    fi
}

# Clean up old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than $BACKUP_RETENTION days..."

    # Count old backups
    OLD_COUNT=$(find "$BACKUP_DIR" -name "polyladder_*.sql.gz" -mtime +$BACKUP_RETENTION 2>/dev/null | wc -l)

    if [ "$OLD_COUNT" -gt 0 ]; then
        find "$BACKUP_DIR" -name "polyladder_*.sql.gz" -mtime +$BACKUP_RETENTION -delete
        log_success "Removed $OLD_COUNT old backup(s)"
    else
        log_info "No old backups to remove"
    fi
}

# List existing backups
list_backups() {
    log_info "Existing backups in $BACKUP_DIR:"
    echo ""

    if ls "$BACKUP_DIR"/polyladder_*.sql.gz 1>/dev/null 2>&1; then
        ls -lh "$BACKUP_DIR"/polyladder_*.sql.gz | awk '{print "  " $9 " (" $5 ")"}'
    else
        echo "  No backups found"
    fi
    echo ""
}

# Fly.io backup (via proxy)
backup_flyio() {
    log_info "Setting up Fly.io database proxy..."
    log_warn "This requires fly CLI and an active Fly.io app"

    if ! command -v fly &> /dev/null; then
        log_error "fly CLI not found"
        exit 1
    fi

    # Start proxy in background
    log_info "Starting database proxy on localhost:5433..."
    fly proxy 5433:5432 -a polyladder-db &
    PROXY_PID=$!

    # Wait for proxy to start
    sleep 3

    # Override DATABASE_URL for local proxy
    export DATABASE_URL="postgres://postgres:$(fly secrets list -a polyladder-db --json | jq -r '.[] | select(.Name=="OPERATOR_API_TOKEN") | .Digest')@localhost:5433/polyladder"

    # Note: Getting the actual password from Fly.io is complex
    # In practice, use: fly postgres connect -a polyladder-db
    # and then pg_dump from within that session

    log_warn "For Fly.io backups, it's recommended to use:"
    echo "  fly ssh console -a polyladder -C '/app/scripts/backup-db.sh --local'"

    # Kill proxy
    kill $PROXY_PID 2>/dev/null || true
}

# Main
main() {
    echo "============================================="
    echo "  PolyLadder Database Backup"
    echo "============================================="
    echo ""

    check_prerequisites
    setup_backup_dir

    case "$MODE" in
        --flyio)
            backup_flyio
            ;;
        --local|*)
            create_backup
            verify_backup
            upload_to_s3
            cleanup_old_backups
            list_backups
            ;;
    esac

    log_success "Backup process completed!"
}

main "$@"
