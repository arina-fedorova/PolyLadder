# =====================================================
# PolyLadder Fly.io Migration Runner (PowerShell)
#
# Usage:
#   .\scripts\flyio-migrate.ps1 [-Command <up|down|status>]
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

param(
    [ValidateSet("up", "down", "status")]
    [string]$Command = "up"
)

$ErrorActionPreference = "Stop"

$APP_NAME = "polyladder"

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

function Write-Error {
    param([string]$Message)
    Write-Host "ERROR: " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

# Check if fly CLI is installed
try {
    $null = Get-Command fly -ErrorAction Stop
}
catch {
    Write-Error "fly CLI not found"
    Write-Host "Install from: https://fly.io/docs/flyctl/install/"
    exit 1
}

# Check if app exists
$apps = fly apps list 2>&1
if ($apps -notmatch $APP_NAME) {
    Write-Error "App '$APP_NAME' not found on Fly.io"
    Write-Host "Deploy first with: .\scripts\deploy-flyio.ps1 -Init"
    exit 1
}

# Check machine status and start if needed
Write-Info "Checking machine status..."
$status = fly status --app $APP_NAME 2>&1
if ($status -notmatch "running") {
    Write-Info "No machines running. Starting a machine..."
    fly machine start --app $APP_NAME 2>&1 | Out-Null
    Start-Sleep -Seconds 5
}

switch ($Command) {
    "up" {
        Write-Info "Running pending migrations..."
        fly ssh console --app $APP_NAME -C "cd /app && node packages/db/dist/migrate.js up"
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Migrations complete"
        }
    }
    "down" {
        Write-Info "Rolling back last migration..."
        fly ssh console --app $APP_NAME -C "cd /app && node packages/db/dist/migrate.js down"
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Rollback complete"
        }
    }
    "status" {
        Write-Info "Checking migration status..."
        fly ssh console --app $APP_NAME -C "cd /app && node packages/db/dist/migrate.js status"
    }
}
