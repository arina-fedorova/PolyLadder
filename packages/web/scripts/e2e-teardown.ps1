# PowerShell script to teardown E2E testing environment for Windows

Write-Host "🧹 Cleaning up E2E test environment..." -ForegroundColor Green

# Stop and remove database container
Write-Host "🗑️  Stopping PostgreSQL container..." -ForegroundColor Cyan
docker compose -f docker/docker-compose.e2e.yml down -v

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to stop PostgreSQL container" -ForegroundColor Red
    exit 1
}

Write-Host "✨ E2E environment cleaned up!" -ForegroundColor Green

