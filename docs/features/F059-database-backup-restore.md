# F059: Database Backup & Restore

**Feature Code**: F059
**Created**: 2025-12-17
**Phase**: 16 - Production Deployment
**Status**: Not Started

---

## Description

Implement automated database backup system with point-in-time recovery and restore procedures.

## Success Criteria

- [ ] Daily automated backups
- [ ] Backup retention policy (30 days)
- [ ] Backup verification
- [ ] Restore procedure documented
- [ ] Backup storage (S3 or Fly.io volumes)
- [ ] Encryption at rest

---

## Tasks

### Task 1: Create Backup Script

**Implementation Plan**:

Create `scripts/backup-db.sh`:
```bash
#!/bin/bash
set -e

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="polyladder_$DATE.sql.gz"

echo "📦 Creating database backup..."

# Create backup directory if doesn't exist
mkdir -p $BACKUP_DIR

# Backup database
pg_dump $DATABASE_URL | gzip > "$BACKUP_DIR/$BACKUP_FILE"

echo "✅ Backup created: $BACKUP_FILE"

# Verify backup
if [ ! -s "$BACKUP_DIR/$BACKUP_FILE" ]; then
    echo "❌ Backup file is empty!"
    exit 1
fi

# Upload to S3 (if configured)
if [ -n "$AWS_S3_BUCKET" ]; then
    aws s3 cp "$BACKUP_DIR/$BACKUP_FILE" "s3://$AWS_S3_BUCKET/backups/"
    echo "☁️  Uploaded to S3"
fi

# Clean up old backups (keep last 30 days)
find $BACKUP_DIR -name "polyladder_*.sql.gz" -mtime +30 -delete
echo "🧹 Old backups cleaned"
```

**Files Created**: `scripts/backup-db.sh`

---

### Task 2: Create Restore Script

**Implementation Plan**:

Create `scripts/restore-db.sh`:
```bash
#!/bin/bash
set -e

if [ -z "$1" ]; then
    echo "Usage: ./restore-db.sh <backup-file>"
    exit 1
fi

BACKUP_FILE=$1

echo "⚠️  WARNING: This will overwrite the current database!"
read -p "Are you sure? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Restore cancelled"
    exit 0
fi

echo "📥 Restoring database from $BACKUP_FILE..."

# Drop existing database (be careful!)
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restore backup
gunzip -c "$BACKUP_FILE" | psql $DATABASE_URL

echo "✅ Database restored successfully"
echo "🔄 Run migrations to ensure schema is up to date"
```

**Files Created**: `scripts/restore-db.sh`

---

### Task 3: Configure Automated Backups

**Implementation Plan**:

For Fly.io, add cron job to fly.toml:
```toml
[[services.concurrency]]
  type = "requests"
  hard_limit = 250

[[services.tcp_checks]]
  interval = "15s"
  timeout = "2s"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256

[[cron]]
  schedule = "0 2 * * *"  # Daily at 2 AM UTC
  command = "/app/scripts/backup-db.sh"
```

Alternative: Use external cron service (GitHub Actions, Vercel Cron, etc.)

**Files Created**: None (update fly.toml)

---

## Dependencies

- **Blocks**: None
- **Depends on**: F001, F058

---

## Notes

- Backups run daily at 2 AM UTC
- 30-day retention policy
- Backups compressed with gzip
- Restore requires downtime (drop schema)
- Consider point-in-time recovery for production (PostgreSQL WAL archiving)
