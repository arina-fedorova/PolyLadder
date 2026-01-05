#!/bin/bash
# =====================================================
# PolyLadder Database Restore Script
#
# Usage:
#   ./scripts/restore-db.sh <backup-file>
#   ./scripts/restore-db.sh --list
#   ./scripts/restore-db.sh --latest
#
# Options:
#   <backup-file>   Path to backup file to restore
#   --list          List available backups
#   --latest        Restore the most recent backup
#   --force         Skip confirmation prompt
#
# Environment Variables:
#   DATABASE_URL    Database connection string
#   BACKUP_DIR      Backup directory (default: ./backups)
#
# Prerequisites:
#   - psql installed
#   - gzip installed
# =====================================================

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_FILE=""
FORCE=false

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

# Show usage
show_usage() {
    echo "Usage: $0 <backup-file> [--force]"
    echo "       $0 --list"
    echo "       $0 --latest [--force]"
    echo ""
    echo "Options:"
    echo "  <backup-file>   Path to backup file to restore"
    echo "  --list          List available backups"
    echo "  --latest        Restore the most recent backup"
    echo "  --force         Skip confirmation prompt"
}

# Check prerequisites
check_prerequisites() {
    if ! command -v psql &> /dev/null; then
        log_error "psql not found. Install PostgreSQL client."
        exit 1
    fi

    if ! command -v gunzip &> /dev/null; then
        log_error "gunzip not found. Install gzip."
        exit 1
    fi

    if [ -z "$DATABASE_URL" ]; then
        log_error "DATABASE_URL environment variable not set"
        exit 1
    fi
}

# List available backups
list_backups() {
    log_info "Available backups in $BACKUP_DIR:"
    echo ""

    if ls "$BACKUP_DIR"/polyladder_*.sql.gz 1>/dev/null 2>&1; then
        ls -lht "$BACKUP_DIR"/polyladder_*.sql.gz | awk '{print "  " $9 " (" $5 ", " $6 " " $7 " " $8 ")"}'
    else
        echo "  No backups found"
    fi
    echo ""
}

# Get latest backup
get_latest_backup() {
    if ls "$BACKUP_DIR"/polyladder_*.sql.gz 1>/dev/null 2>&1; then
        ls -t "$BACKUP_DIR"/polyladder_*.sql.gz | head -1
    else
        log_error "No backups found in $BACKUP_DIR"
        exit 1
    fi
}

# Verify backup file
verify_backup() {
    local file="$1"

    if [ ! -f "$file" ]; then
        log_error "Backup file not found: $file"
        exit 1
    fi

    if [ ! -s "$file" ]; then
        log_error "Backup file is empty: $file"
        exit 1
    fi

    log_info "Verifying backup integrity..."
    if gunzip -t "$file" 2>/dev/null; then
        log_success "Backup file is valid"
    else
        log_error "Backup file is corrupted!"
        exit 1
    fi
}

# Confirm restore
confirm_restore() {
    if [ "$FORCE" = true ]; then
        return 0
    fi

    echo ""
    log_warn "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    log_warn "  WARNING: This will DESTROY all current data!"
    log_warn "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo ""
    log_info "Backup file: $BACKUP_FILE"
    echo ""

    read -p "Are you absolutely sure? Type 'yes' to confirm: " CONFIRM

    if [ "$CONFIRM" != "yes" ]; then
        log_info "Restore cancelled"
        exit 0
    fi
}

# Restore database
restore_database() {
    log_info "Starting database restore..."

    # Create a temporary file for decompressed backup
    TEMP_FILE=$(mktemp)
    trap "rm -f $TEMP_FILE" EXIT

    log_info "Decompressing backup..."
    gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"

    log_info "Dropping existing schema..."
    psql "$DATABASE_URL" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" 2>/dev/null || {
        log_warn "Could not drop schema, attempting restore anyway..."
    }

    log_info "Restoring database..."
    psql "$DATABASE_URL" -f "$TEMP_FILE" --quiet 2>&1 | grep -v "^SET$" | grep -v "^$" || true

    log_success "Database restored successfully!"
}

# Post-restore instructions
post_restore() {
    echo ""
    log_info "Post-restore checklist:"
    echo "  1. Run migrations: pnpm --filter @polyladder/db migrate:up"
    echo "  2. Verify data: psql \$DATABASE_URL -c 'SELECT COUNT(*) FROM users'"
    echo "  3. Test application functionality"
    echo ""
}

# Parse arguments
parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --list)
                list_backups
                exit 0
                ;;
            --latest)
                BACKUP_FILE=$(get_latest_backup)
                ;;
            --force)
                FORCE=true
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                if [ -z "$BACKUP_FILE" ]; then
                    BACKUP_FILE="$1"
                else
                    log_error "Unknown argument: $1"
                    show_usage
                    exit 1
                fi
                ;;
        esac
        shift
    done

    if [ -z "$BACKUP_FILE" ]; then
        log_error "No backup file specified"
        show_usage
        exit 1
    fi
}

# Main
main() {
    echo "============================================="
    echo "  PolyLadder Database Restore"
    echo "============================================="
    echo ""

    parse_args "$@"
    check_prerequisites
    verify_backup "$BACKUP_FILE"
    confirm_restore
    restore_database
    post_restore

    log_success "Restore process completed!"
}

main "$@"
