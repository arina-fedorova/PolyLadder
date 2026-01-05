# =====================================================
# PolyLadder Fly.io Deployment Script (PowerShell)
#
# Usage:
#   .\scripts\deploy-flyio.ps1 [-Init]
#
# Options:
#   -Init    First-time setup (creates app, database, secrets)
#
# Prerequisites:
#   - fly CLI installed: https://fly.io/docs/flyctl/install/
#   - fly auth login completed
# =====================================================

param(
    [switch]$Init
)

$ErrorActionPreference = "Stop"

$APP_NAME = "polyladder"
$DB_NAME = "polyladder-db"
$REGION = "iad"

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

function Test-FlyCliInstalled {
    try {
        $null = Get-Command fly -ErrorAction Stop
        Write-Success "fly CLI found"
        return $true
    }
    catch {
        Write-Error "fly CLI not found"
        Write-Host "Install from: https://fly.io/docs/flyctl/install/"
        return $false
    }
}

function Test-FlyAuth {
    try {
        $whoami = fly auth whoami 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Not authenticated"
        }
        Write-Success "Authenticated as $whoami"
        return $true
    }
    catch {
        Write-Error "Not logged in to Fly.io"
        Write-Host "Run: fly auth login"
        return $false
    }
}

function Initialize-FlyApp {
    Write-Info "Initializing Fly.io deployment..."

    # Create app if doesn't exist
    $apps = fly apps list 2>&1
    if ($apps -match $APP_NAME) {
        Write-Warning "App '$APP_NAME' already exists"
    }
    else {
        Write-Info "Creating app '$APP_NAME'..."
        fly apps create $APP_NAME --org personal
        if ($LASTEXITCODE -eq 0) {
            Write-Success "App created"
        }
    }

    # Create PostgreSQL database if doesn't exist
    $dbs = fly postgres list 2>&1
    if ($dbs -match $DB_NAME) {
        Write-Warning "Database '$DB_NAME' already exists"
    }
    else {
        Write-Info "Creating PostgreSQL database '$DB_NAME'..."
        fly postgres create `
            --name $DB_NAME `
            --region $REGION `
            --initial-cluster-size 1 `
            --vm-size shared-cpu-1x `
            --volume-size 1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Database created"
        }
    }

    # Attach database to app
    Write-Info "Attaching database to app..."
    fly postgres attach $DB_NAME --app $APP_NAME 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Database attached"
    }
    else {
        Write-Warning "Database may already be attached"
    }

    # Generate and set secrets
    Write-Info "Setting secrets..."

    $secrets = fly secrets list --app $APP_NAME 2>&1

    if ($secrets -notmatch "JWT_SECRET") {
        $jwtSecret = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
        fly secrets set JWT_SECRET="$jwtSecret" --app $APP_NAME
        Write-Success "JWT_SECRET set"
    }
    else {
        Write-Warning "JWT_SECRET already set"
    }

    if ($secrets -notmatch "JWT_REFRESH_SECRET") {
        $jwtRefreshSecret = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
        fly secrets set JWT_REFRESH_SECRET="$jwtRefreshSecret" --app $APP_NAME
        Write-Success "JWT_REFRESH_SECRET set"
    }
    else {
        Write-Warning "JWT_REFRESH_SECRET already set"
    }

    Write-Success "Initialization complete!"
}

function Deploy-FlyApp {
    Write-Info "Deploying $APP_NAME to Fly.io..."

    # Check if app exists
    $apps = fly apps list 2>&1
    if ($apps -notmatch $APP_NAME) {
        Write-Error "App '$APP_NAME' does not exist"
        Write-Host "Run with -Init flag for first-time setup: .\scripts\deploy-flyio.ps1 -Init"
        exit 1
    }

    # Deploy (without high availability for cost savings)
    fly deploy --app $APP_NAME --ha=false

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Deployment complete!"
        Write-Host ""
        Write-Host "App URL: https://$APP_NAME.fly.dev"
        Write-Host "Dashboard: https://fly.io/apps/$APP_NAME"
        Write-Host ""
        Write-Host "Useful commands:"
        Write-Host "  fly logs --app $APP_NAME          # View logs"
        Write-Host "  fly ssh console --app $APP_NAME   # SSH into container"
        Write-Host "  fly status --app $APP_NAME        # Check status"
    }
}

# Main
Write-Host "============================================="
Write-Host "  PolyLadder Fly.io Deployment"
Write-Host "============================================="
Write-Host ""

if (-not (Test-FlyCliInstalled)) { exit 1 }
if (-not (Test-FlyAuth)) { exit 1 }

if ($Init) {
    Initialize-FlyApp
}

Deploy-FlyApp
