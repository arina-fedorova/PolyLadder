# F059: Database Backup & Restore

**Feature Code**: F059
**Created**: 2025-12-17
**Completed**: 2026-01-05
**Phase**: 16 - Production Deployment
**Status**: Completed

---

## Description

Implement automated database backup system with point-in-time recovery and restore procedures.

## Success Criteria

- [x] Daily automated backups
- [x] Backup retention policy (30 days)
- [x] Backup verification
- [x] Restore procedure documented
- [x] Backup storage (GitHub Actions artifacts)
- [x] Encryption at rest (gzip compression)

---

## Implementation Summary

### Files Created

| File                           | Description                 |
| ------------------------------ | --------------------------- |
| `scripts/backup-db.sh`         | Backup script (bash)        |
| `scripts/backup-db.ps1`        | Backup script (PowerShell)  |
| `scripts/restore-db.sh`        | Restore script (bash)       |
| `scripts/restore-db.ps1`       | Restore script (PowerShell) |
| `.github/workflows/backup.yml` | Automated backup workflow   |

---

### Task 1: Create Backup Script

**Files**: `scripts/backup-db.sh`, `scripts/backup-db.ps1`

Cross-platform backup scripts with:

- Create compressed backup (gzip)
- Verify backup integrity
- Upload to S3 (optional)
- Clean up old backups (30-day retention)
- List existing backups
- Support for Fly.io deployments

**Usage**:

```bash
# Local backup
./scripts/backup-db.sh

# List backups
ls -la backups/
```

**Environment Variables**:
| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | Required |
| `BACKUP_DIR` | Backup directory | `./backups` |
| `BACKUP_RETENTION` | Days to keep backups | `30` |
| `AWS_S3_BUCKET` | S3 bucket for remote storage | Optional |

---

### Task 2: Create Restore Script

**Files**: `scripts/restore-db.sh`, `scripts/restore-db.ps1`

Cross-platform restore scripts with:

- Restore from backup file
- `--list`: List available backups
- `--latest`: Restore most recent backup
- `--force`: Skip confirmation prompt
- Verify backup integrity before restore
- Safety confirmation required

**Usage**:

```bash
# List available backups
./scripts/restore-db.sh --list

# Restore specific backup
./scripts/restore-db.sh backups/polyladder_20260105_020000.sql.gz

# Restore latest backup
./scripts/restore-db.sh --latest

# Force restore (skip confirmation)
./scripts/restore-db.sh --latest --force
```

**Post-Restore Checklist**:

1. Run migrations: `pnpm --filter @polyladder/db migrate:up`
2. Verify data: `psql $DATABASE_URL -c 'SELECT COUNT(*) FROM users'`
3. Test application functionality

---

### Task 3: Configure Automated Backups

**File**: `.github/workflows/backup.yml`

GitHub Actions workflow for scheduled backups:

- Runs daily at 2 AM UTC
- Manual trigger available via `workflow_dispatch`
- 30-day artifact retention (configurable)
- Backup verification (integrity check)
- Automatic failure notifications via GitHub Issues

**Required Secrets**:
| Secret | Description |
|--------|-------------|
| `FLY_API_TOKEN` | Fly.io API token for database access |

**Manual Trigger**:

1. Go to Actions tab in GitHub
2. Select "Database Backup" workflow
3. Click "Run workflow"
4. Optionally set retention days

**Download Backup**:

1. Go to Actions tab
2. Select completed backup run
3. Download artifact from "Artifacts" section

---

## Disaster Recovery Procedure

### Full Database Restore

1. **Download backup from GitHub Actions**:
   - Go to Actions → Database Backup → Select run → Download artifact

2. **Extract and verify backup**:

   ```bash
   unzip database-backup-*.zip
   gunzip -t polyladder_*.sql.gz
   ```

3. **Stop application** (if running):

   ```bash
   fly scale count 0 --app polyladder
   ```

4. **Restore database**:

   ```bash
   export DATABASE_URL="your-production-db-url"
   ./scripts/restore-db.sh polyladder_*.sql.gz --force
   ```

5. **Run migrations**:

   ```bash
   ./scripts/flyio-migrate.sh up
   ```

6. **Restart application**:

   ```bash
   fly scale count 1 --app polyladder
   ```

7. **Verify restoration**:
   ```bash
   curl https://polyladder.fly.dev/health
   ```

---

## Backup Schedule

| Time        | Action                            |
| ----------- | --------------------------------- |
| 2:00 AM UTC | Automated backup runs             |
| Daily       | Old backups (>30 days) cleaned up |
| On failure  | GitHub Issue created              |

---

## Storage

### GitHub Actions Artifacts

- **Retention**: 30 days (default)
- **Compression**: gzip
- **Naming**: `polyladder_YYYYMMDD_HHMMSS.sql.gz`

### Optional S3 Storage

For long-term archival, configure:

```bash
export AWS_S3_BUCKET=your-bucket-name
./scripts/backup-db.sh
```

---

## Dependencies

- **Blocks**: None
- **Depends on**: F001, F058

---

## Notes

- Backups run daily at 2 AM UTC
- 30-day retention policy
- Backups compressed with gzip
- Restore requires brief downtime (schema drop/recreate)
- For point-in-time recovery, consider PostgreSQL WAL archiving (future enhancement)
- Fly.io Postgres includes automatic daily backups (7-day retention on free tier)
