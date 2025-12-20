# PowerShell script for Windows
$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting test database..." -ForegroundColor Cyan
docker-compose -f docker/docker-compose.test.yml up -d --wait

Write-Host "⏳ Waiting for database to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

$env:DATABASE_URL = "postgres://test:test@localhost:5433/polyladder_test"
$env:JWT_SECRET = "test-secret-key-that-is-at-least-32-characters-long"
$env:FRONTEND_URL = "http://localhost:5173"
$env:NODE_ENV = "test"

try {
    Write-Host "📦 Running migrations..." -ForegroundColor Cyan
    pnpm --filter @polyladder/db migrate up

    Write-Host "🧪 Running unit tests..." -ForegroundColor Cyan
    pnpm test

    Write-Host "🔗 Running integration tests..." -ForegroundColor Cyan
    pnpm test:integration

    Write-Host "✅ All tests passed!" -ForegroundColor Green
}
finally {
    Write-Host "🧹 Cleaning up..." -ForegroundColor Yellow
    docker-compose -f docker/docker-compose.test.yml down -v
}

Write-Host "🎉 Done!" -ForegroundColor Green

