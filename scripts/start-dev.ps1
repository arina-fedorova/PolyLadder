#!/usr/bin/env pwsh
# PolyLadder Development Environment Startup Script

Write-Host "🚀 Starting PolyLadder Development Environment..." -ForegroundColor Cyan

# Check if Docker is running
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Stop and remove existing containers
Write-Host "🧹 Cleaning up existing containers..." -ForegroundColor Yellow
docker-compose -f docker/docker-compose.yml down 2>&1 | Out-Null

# Check if port 5432 is already in use
$port5432 = Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue
if ($port5432) {
    Write-Host "⚠️  Port 5432 is already in use. Stopping existing PostgreSQL container..." -ForegroundColor Yellow
    docker stop polyladder-db-dev 2>&1 | Out-Null
    docker rm polyladder-db-dev 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

# Start services
Write-Host "🐳 Starting Docker containers..." -ForegroundColor Cyan
docker-compose -f docker/docker-compose.yml up -d db

# Wait for database to be ready
Write-Host "⏳ Waiting for database to be ready..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
do {
    Start-Sleep -Seconds 2
    $attempt++
    $dbReady = docker exec polyladder-db-dev pg_isready -U dev -d polyladder 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database is ready!" -ForegroundColor Green
        break
    }
    Write-Host "   Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
} while ($attempt -lt $maxAttempts)

if ($attempt -eq $maxAttempts) {
    Write-Host "❌ Database failed to start. Check logs with: docker-compose -f docker/docker-compose.yml logs db" -ForegroundColor Red
    exit 1
}

# Run migrations
Write-Host "📦 Running database migrations..." -ForegroundColor Cyan
$env:DATABASE_URL = "postgres://dev:dev@localhost:5432/polyladder"
$env:NODE_ENV = "development"
pnpm --filter @polyladder/db migrate:up
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Migration failed, but continuing..." -ForegroundColor Yellow
}

# Start all services
Write-Host "🚀 Starting all services (API, Refinement, Web)..." -ForegroundColor Cyan
docker-compose -f docker/docker-compose.yml up -d

# Wait a bit for services to start
Start-Sleep -Seconds 5

# Show status
Write-Host "`n📊 Service Status:" -ForegroundColor Cyan
docker-compose -f docker/docker-compose.yml ps

Write-Host "`n✅ Development environment is ready!" -ForegroundColor Green
Write-Host "`n📍 Services:" -ForegroundColor Cyan
Write-Host "   • API:        http://localhost:3000" -ForegroundColor White
Write-Host "   • Web:        http://localhost:5173" -ForegroundColor White
Write-Host "   • Database:   localhost:5432" -ForegroundColor White
Write-Host "`n📝 Useful commands:" -ForegroundColor Cyan
Write-Host "   • View logs:    docker-compose -f docker/docker-compose.yml logs -f" -ForegroundColor Gray
Write-Host "   • Stop all:     docker-compose -f docker/docker-compose.yml down" -ForegroundColor Gray
Write-Host "   • Restart:      docker-compose -f docker/docker-compose.yml restart" -ForegroundColor Gray
Write-Host "`n"

