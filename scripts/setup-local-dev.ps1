# PowerShell script for Windows

Write-Host "🚀 Setting up PolyLadder local development environment..." -ForegroundColor Cyan

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
JWT_SECRET=dev-secret-key-must-be-at-least-32-characters-long-for-security
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=debug
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
"@ | Out-File -FilePath "packages/api/.env" -Encoding utf8
    Write-Host "✅ Created packages/api/.env" -ForegroundColor Green
} else {
    Write-Host "ℹ️  packages/api/.env already exists, skipping..." -ForegroundColor Gray
}

# Web .env
if (-not (Test-Path "packages/web/.env")) {
    @"
VITE_API_URL=http://localhost:3000/api/v1
"@ | Out-File -FilePath "packages/web/.env" -Encoding utf8
    Write-Host "✅ Created packages/web/.env" -ForegroundColor Green
} else {
    Write-Host "ℹ️  packages/web/.env already exists, skipping..." -ForegroundColor Gray
}

# Refinement Service .env
if (-not (Test-Path "packages/refinement-service/.env")) {
    @"
NODE_ENV=development
DATABASE_URL=postgres://dev:dev@localhost:5432/polyladder
LOG_LEVEL=debug
# ANTHROPIC_API_KEY=sk-ant-your-key-here
"@ | Out-File -FilePath "packages/refinement-service/.env" -Encoding utf8
    Write-Host "✅ Created packages/refinement-service/.env" -ForegroundColor Green
    Write-Host "⚠️  Don't forget to add your ANTHROPIC_API_KEY to packages/refinement-service/.env" -ForegroundColor Yellow
} else {
    Write-Host "ℹ️  packages/refinement-service/.env already exists, skipping..." -ForegroundColor Gray
}

# Start database
Write-Host "🗄️  Starting database..." -ForegroundColor Yellow
docker-compose -f docker/docker-compose.yml up -d db

Write-Host "⏳ Waiting for database to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Run migrations
Write-Host "📊 Running database migrations..." -ForegroundColor Yellow
$env:DATABASE_URL = "postgres://dev:dev@localhost:5432/polyladder"
pnpm --filter @polyladder/db migrate:up

Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Start API server: pnpm --filter @polyladder/api dev"
Write-Host "2. Start web app: pnpm --filter @polyladder/web dev"
Write-Host "3. (Optional) Start refinement service: pnpm --filter @polyladder/refinement-service dev"
Write-Host ""
Write-Host "Create test users:" -ForegroundColor Cyan
Write-Host "  Operator: Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/register' -Method Post -ContentType 'application/json' -Body '{\"email\":\"operator@test.com\",\"password\":\"TestPass123!\",\"role\":\"operator\"}'"
Write-Host "  Learner: Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/register' -Method Post -ContentType 'application/json' -Body '{\"email\":\"learner@test.com\",\"password\":\"TestPass123!\"}'"

