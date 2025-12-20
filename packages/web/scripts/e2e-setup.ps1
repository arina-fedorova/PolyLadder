# PowerShell script to setup E2E testing environment for Windows

Write-Host "🚀 Setting up E2E test environment..." -ForegroundColor Green

# Start E2E database
Write-Host "📦 Starting PostgreSQL container..." -ForegroundColor Cyan
docker compose -f docker/docker-compose.e2e.yml up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start PostgreSQL container" -ForegroundColor Red
    exit 1
}

# Wait for database to be ready
Write-Host "⏳ Waiting for database to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Run migrations
Write-Host "🔧 Running database migrations..." -ForegroundColor Cyan
$env:DATABASE_URL = "postgres://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e"
pnpm --filter @polyladder/db migrate up

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to run migrations" -ForegroundColor Red
    exit 1
}

Write-Host "✨ E2E environment ready! You can now run: pnpm test:e2e" -ForegroundColor Green

