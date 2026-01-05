# =====================================================
# PolyLadder Database Backup Script (PowerShell)
#
# Usage:
#   .\scripts\backup-db.ps1 [-Local] [-FlyIo]
#
# Options:
#   -Local    Backup local database (default)
#   -FlyIo    Backup Fly.io database via proxy
#
# Environment Variables:
#   DATABASE_URL        Database connection string
#   BACKUP_DIR          Backup directory (default: ./backups)
#   BACKUP_RETENTION    Days to keep backups (default: 30)
#   AWS_S3_BUCKET       S3 bucket for remote storage (optional)
#
# Prerequisites:
#   - pg_dump installed (PostgreSQL client)
#   - aws CLI (if using S3)
# =====================================================

param(
    [switch]$Local,
    [switch]$FlyIo
)

$ErrorActionPreference = "Stop"

# Configuration
$BACKUP_DIR = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "./backups" }
$BACKUP_RETENTION = if ($env:BACKUP_RETENTION) { [int]$env:BACKUP_RETENTION } else { 30 }
$DATE = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_FILE = "polyladder_${DATE}.sql.gz"

function Write-Info {
    param([string]$Message)
    Write-Host "INFO: " -ForegroundColor Blue -NoNewline
    Write-Host $Message
}

function Write-Success {
    param([string]$Message)
    Write-Host "SUCCESS: " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-Warning {
    param([string]$Message)
    Write-Host "WARNING: " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

function Write-Error {
    param([string]$Message)
    Write-Host "ERROR: " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

function Test-Prerequisites {
    try {
        $null = Get-Command pg_dump -ErrorAction Stop
    }
    catch {
        Write-Error "pg_dump not found. Install PostgreSQL client."
        exit 1
    }

    if (-not $env:DATABASE_URL) {
        Write-Error "DATABASE_URL environment variable not set"
        exit 1
    }
}

function Initialize-BackupDir {
    if (-not (Test-Path $BACKUP_DIR)) {
        Write-Info "Creating backup directory: $BACKUP_DIR"
        New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null
    }
}

function New-Backup {
    Write-Info "Creating database backup..."
    Write-Info "Backup file: $BACKUP_FILE"

    $backupPath = Join-Path $BACKUP_DIR $BACKUP_FILE
    $tempFile = Join-Path $BACKUP_DIR "temp_backup.sql"

    # Create the backup
    pg_dump $env:DATABASE_URL --no-owner --no-acl | Out-File -FilePath $tempFile -Encoding UTF8

    # Compress using .NET (Windows doesn't have gzip by default)
    $bytes = [System.IO.File]::ReadAllBytes($tempFile)
    $ms = New-Object System.IO.MemoryStream
    $gzip = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Compress)
    $gzip.Write($bytes, 0, $bytes.Length)
    $gzip.Close()
    [System.IO.File]::WriteAllBytes($backupPath, $ms.ToArray())

    # Clean up temp file
    Remove-Item $tempFile -Force

    # Verify backup file exists and is not empty
    if (-not (Test-Path $backupPath) -or (Get-Item $backupPath).Length -eq 0) {
        Write-Error "Backup file is empty or was not created!"
        exit 1
    }

    $fileSize = "{0:N2} MB" -f ((Get-Item $backupPath).Length / 1MB)
    Write-Success "Backup created: $BACKUP_FILE ($fileSize)"
}

function Test-BackupIntegrity {
    Write-Info "Verifying backup integrity..."

    $backupPath = Join-Path $BACKUP_DIR $BACKUP_FILE

    try {
        $fs = [System.IO.File]::OpenRead($backupPath)
        $gzip = New-Object System.IO.Compression.GZipStream($fs, [System.IO.Compression.CompressionMode]::Decompress)
        $buffer = New-Object byte[] 1024
        $null = $gzip.Read($buffer, 0, $buffer.Length)
        $gzip.Close()
        $fs.Close()
        Write-Success "Backup integrity verified"
    }
    catch {
        Write-Error "Backup file is corrupted!"
        exit 1
    }
}

function Send-ToS3 {
    if ($env:AWS_S3_BUCKET) {
        try {
            $null = Get-Command aws -ErrorAction Stop
        }
        catch {
            Write-Warning "aws CLI not found. Skipping S3 upload."
            return
        }

        $backupPath = Join-Path $BACKUP_DIR $BACKUP_FILE
        Write-Info "Uploading to S3: s3://$($env:AWS_S3_BUCKET)/backups/$BACKUP_FILE"
        aws s3 cp $backupPath "s3://$($env:AWS_S3_BUCKET)/backups/$BACKUP_FILE"
        Write-Success "Uploaded to S3"
    }
}

function Remove-OldBackups {
    Write-Info "Cleaning up backups older than $BACKUP_RETENTION days..."

    $cutoffDate = (Get-Date).AddDays(-$BACKUP_RETENTION)
    $oldBackups = Get-ChildItem -Path $BACKUP_DIR -Filter "polyladder_*.sql.gz" |
                  Where-Object { $_.LastWriteTime -lt $cutoffDate }

    if ($oldBackups.Count -gt 0) {
        $oldBackups | Remove-Item -Force
        Write-Success "Removed $($oldBackups.Count) old backup(s)"
    }
    else {
        Write-Info "No old backups to remove"
    }
}

function Get-BackupList {
    Write-Info "Existing backups in ${BACKUP_DIR}:"
    Write-Host ""

    $backups = Get-ChildItem -Path $BACKUP_DIR -Filter "polyladder_*.sql.gz" -ErrorAction SilentlyContinue

    if ($backups) {
        foreach ($backup in $backups | Sort-Object LastWriteTime -Descending) {
            $size = "{0:N2} MB" -f ($backup.Length / 1MB)
            Write-Host "  $($backup.Name) ($size)"
        }
    }
    else {
        Write-Host "  No backups found"
    }
    Write-Host ""
}

# Main
Write-Host "============================================="
Write-Host "  PolyLadder Database Backup"
Write-Host "============================================="
Write-Host ""

Test-Prerequisites
Initialize-BackupDir

if ($FlyIo) {
    Write-Warning "For Fly.io backups, use:"
    Write-Host "  fly ssh console -a polyladder -C '/app/scripts/backup-db.sh --local'"
}
else {
    New-Backup
    Test-BackupIntegrity
    Send-ToS3
    Remove-OldBackups
    Get-BackupList
}

Write-Success "Backup process completed!"
