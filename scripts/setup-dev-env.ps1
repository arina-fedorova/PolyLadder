# PowerShell script for Windows

Write-Host "🚀 Setting up PolyLadder development environment..." -ForegroundColor Cyan

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is required but not installed. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ pnpm is required but not installed. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker is required but not installed. Aborting." -ForegroundColor Red
    exit 1
}

$nodeVersion = (node -v).Substring(1).Split('.')[0]
if ([int]$nodeVersion -lt 20) {
    Write-Host "❌ Node.js version 20+ is required. Current: $(node -v)" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Prerequisites check passed" -ForegroundColor Green

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
pnpm install

# Setup environment files
Write-Host "⚙️  Setting up environment files..." -ForegroundColor Yellow

# API .env
if (-not (Test-Path "packages/api/.env")) {
    @"
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgres://dev:dev@localhost:5432/polyladder
JWT_SECRET=dev-secret-key-must-be-at-least-32-characters-long-for-development
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=debug
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
APP_VERSION=0.1.0
"@ | Out-File -FilePath "packages/api/.env" -Encoding utf8
    Write-Host "✅ Created packages/api/.env" -ForegroundColor Green
} else {
    Write-Host "ℹ️  packages/api/.env already exists, skipping" -ForegroundColor Gray
}

# Web .env
if (-not (Test-Path "packages/web/.env")) {
    @"
VITE_API_URL=http://localhost:3000/api/v1
"@ | Out-File -FilePath "packages/web/.env" -Encoding utf8
    Write-Host "✅ Created packages/web/.env" -ForegroundColor Green
} else {
    Write-Host "ℹ️  packages/web/.env already exists, skipping" -ForegroundColor Gray
}

# Start database
Write-Host "🗄️  Starting database..." -ForegroundColor Yellow
docker-compose -f docker/docker-compose.yml up -d db

# Wait for database to be ready
Write-Host "⏳ Waiting for database to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

$maxAttempts = 30
$attempt = 0
while ($attempt -lt $maxAttempts) {
    $result = docker exec polyladder-db-dev pg_isready -U dev -d polyladder 2>&1
    if ($LASTEXITCODE -eq 0) {
        break
    }
    Write-Host "   Waiting for database..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
    $attempt++
}

if ($attempt -eq $maxAttempts) {
    Write-Host "❌ Database failed to start" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Database is ready" -ForegroundColor Green

# Run migrations
Write-Host "🔄 Running database migrations..." -ForegroundColor Yellow
pnpm --filter @polyladder/db migrate:up

Write-Host ""
Write-Host "✅ Development environment setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start API server:    cd packages/api && pnpm dev"
Write-Host "  2. Start web app:       cd packages/web && pnpm dev"
Write-Host "  3. Open browser:        http://localhost:5173"
Write-Host ""
Write-Host "To stop database:" -ForegroundColor Cyan
Write-Host "  docker-compose -f docker/docker-compose.yml down"

