# =====================================================
# PolyLadder Database Restore Script (PowerShell)
#
# Usage:
#   .\scripts\restore-db.ps1 -BackupFile <path>
#   .\scripts\restore-db.ps1 -List
#   .\scripts\restore-db.ps1 -Latest
#
# Options:
#   -BackupFile     Path to backup file to restore
#   -List           List available backups
#   -Latest         Restore the most recent backup
#   -Force          Skip confirmation prompt
#
# Environment Variables:
#   DATABASE_URL    Database connection string
#   BACKUP_DIR      Backup directory (default: ./backups)
#
# Prerequisites:
#   - psql installed (PostgreSQL client)
# =====================================================

param(
    [string]$BackupFile,
    [switch]$List,
    [switch]$Latest,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# Configuration
$BACKUP_DIR = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "./backups" }

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
        $null = Get-Command psql -ErrorAction Stop
    }
    catch {
        Write-Error "psql not found. Install PostgreSQL client."
        exit 1
    }

    if (-not $env:DATABASE_URL) {
        Write-Error "DATABASE_URL environment variable not set"
        exit 1
    }
}

function Get-BackupList {
    Write-Info "Available backups in ${BACKUP_DIR}:"
    Write-Host ""

    $backups = Get-ChildItem -Path $BACKUP_DIR -Filter "polyladder_*.sql.gz" -ErrorAction SilentlyContinue

    if ($backups) {
        foreach ($backup in $backups | Sort-Object LastWriteTime -Descending) {
            $size = "{0:N2} MB" -f ($backup.Length / 1MB)
            $date = $backup.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
            Write-Host "  $($backup.FullName) ($size, $date)"
        }
    }
    else {
        Write-Host "  No backups found"
    }
    Write-Host ""
}

function Get-LatestBackup {
    $backups = Get-ChildItem -Path $BACKUP_DIR -Filter "polyladder_*.sql.gz" -ErrorAction SilentlyContinue |
               Sort-Object LastWriteTime -Descending

    if ($backups) {
        return $backups[0].FullName
    }
    else {
        Write-Error "No backups found in $BACKUP_DIR"
        exit 1
    }
}

function Test-BackupFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        Write-Error "Backup file not found: $Path"
        exit 1
    }

    if ((Get-Item $Path).Length -eq 0) {
        Write-Error "Backup file is empty: $Path"
        exit 1
    }

    Write-Info "Verifying backup integrity..."

    try {
        $fs = [System.IO.File]::OpenRead($Path)
        $gzip = New-Object System.IO.Compression.GZipStream($fs, [System.IO.Compression.CompressionMode]::Decompress)
        $buffer = New-Object byte[] 1024
        $null = $gzip.Read($buffer, 0, $buffer.Length)
        $gzip.Close()
        $fs.Close()
        Write-Success "Backup file is valid"
    }
    catch {
        Write-Error "Backup file is corrupted!"
        exit 1
    }
}

function Confirm-Restore {
    param([string]$Path)

    if ($Force) {
        return
    }

    Write-Host ""
    Write-Warning "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    Write-Warning "  WARNING: This will DESTROY all current data!"
    Write-Warning "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    Write-Host ""
    Write-Info "Backup file: $Path"
    Write-Host ""

    $confirm = Read-Host "Are you absolutely sure? Type 'yes' to confirm"

    if ($confirm -ne "yes") {
        Write-Info "Restore cancelled"
        exit 0
    }
}

function Restore-Database {
    param([string]$Path)

    Write-Info "Starting database restore..."

    # Create temporary file for decompressed backup
    $tempFile = [System.IO.Path]::GetTempFileName()

    try {
        Write-Info "Decompressing backup..."

        # Decompress gzip
        $fs = [System.IO.File]::OpenRead($Path)
        $gzip = New-Object System.IO.Compression.GZipStream($fs, [System.IO.Compression.CompressionMode]::Decompress)
        $outFs = [System.IO.File]::Create($tempFile)

        $buffer = New-Object byte[] 65536
        while (($read = $gzip.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $outFs.Write($buffer, 0, $read)
        }

        $gzip.Close()
        $fs.Close()
        $outFs.Close()

        Write-Info "Dropping existing schema..."
        $dropResult = psql $env:DATABASE_URL -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not drop schema, attempting restore anyway..."
        }

        Write-Info "Restoring database..."
        psql $env:DATABASE_URL -f $tempFile --quiet 2>&1 | Out-Null

        Write-Success "Database restored successfully!"
    }
    finally {
        # Clean up temp file
        if (Test-Path $tempFile) {
            Remove-Item $tempFile -Force
        }
    }
}

function Show-PostRestore {
    Write-Host ""
    Write-Info "Post-restore checklist:"
    Write-Host "  1. Run migrations: pnpm --filter @polyladder/db migrate:up"
    Write-Host "  2. Verify data: psql `$env:DATABASE_URL -c 'SELECT COUNT(*) FROM users'"
    Write-Host "  3. Test application functionality"
    Write-Host ""
}

# Main
Write-Host "============================================="
Write-Host "  PolyLadder Database Restore"
Write-Host "============================================="
Write-Host ""

if ($List) {
    Get-BackupList
    exit 0
}

if ($Latest) {
    $BackupFile = Get-LatestBackup
}

if (-not $BackupFile) {
    Write-Error "No backup file specified. Use -BackupFile, -Latest, or -List"
    exit 1
}

Test-Prerequisites
Test-BackupFile -Path $BackupFile
Confirm-Restore -Path $BackupFile
Restore-Database -Path $BackupFile
Show-PostRestore

Write-Success "Restore process completed!"
