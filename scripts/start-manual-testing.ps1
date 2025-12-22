# PowerShell script to start all services for manual testing

Write-Host "🚀 Starting PolyLadder for manual testing..." -ForegroundColor Cyan
Write-Host ""

# Check if database is running
Write-Host "📋 Checking database status..." -ForegroundColor Yellow
$dbRunning = docker ps --filter "name=polyladder-db-dev" --format "{{.Names}}" | Select-String "polyladder-db-dev"

if (-not $dbRunning) {
    Write-Host "🗄️  Starting database..." -ForegroundColor Yellow
    docker-compose -f docker/docker-compose.yml up -d db
    
    Write-Host "⏳ Waiting for database to be ready..." -ForegroundColor Yellow
    $maxAttempts = 30
    $attempt = 0
    do {
        Start-Sleep -Seconds 1
        $attempt++
        $ready = docker exec polyladder-db-dev pg_isready -U dev -d polyladder 2>&1
        if ($ready -match "accepting connections") {
            Write-Host "✅ Database is ready" -ForegroundColor Green
            break
        }
    } while ($attempt -lt $maxAttempts)
    
    if ($attempt -eq $maxAttempts) {
        Write-Host "❌ Database failed to start. Aborting." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ Database is already running" -ForegroundColor Green
}

# Check migrations
Write-Host "📊 Checking database migrations..." -ForegroundColor Yellow
$env:DATABASE_URL = "postgres://dev:dev@localhost:5432/polyladder"
pnpm --filter @polyladder/db migrate:up --silent

# Check .env files
Write-Host "⚙️  Checking environment files..." -ForegroundColor Yellow

if (-not (Test-Path "packages/api/.env")) {
    Write-Host "⚠️  packages/api/.env not found. Run setup-local-dev.ps1 first." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path "packages/web/.env")) {
    Write-Host "⚠️  packages/web/.env not found. Run setup-local-dev.ps1 first." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Environment files found" -ForegroundColor Green

Write-Host ""
Write-Host "🎯 Starting services..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Services will start in separate windows:" -ForegroundColor Yellow
Write-Host "  - API Server: http://localhost:3000" -ForegroundColor White
Write-Host "  - Web App: http://localhost:5173" -ForegroundColor White
Write-Host "  - Refinement Service: (optional)" -ForegroundColor Gray
Write-Host ""

# Start API server in new window
Write-Host "📡 Starting API server..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PWD'; pnpm --filter @polyladder/api dev" -WindowStyle Normal

Start-Sleep -Seconds 2

# Start Web app in new window
Write-Host "🌐 Starting Web application..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PWD'; pnpm --filter @polyladder/web dev" -WindowStyle Normal

Write-Host ""
Write-Host "✅ Services started!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Manual Testing Guide:" -ForegroundColor Cyan
Write-Host "  1. Wait for services to start (check windows for startup messages)" -ForegroundColor White
Write-Host "  2. Open http://localhost:5173 in your browser" -ForegroundColor White
Write-Host "  3. Register test users:" -ForegroundColor White
Write-Host "     - Operator: operator@test.com / TestPass123!" -ForegroundColor Gray
Write-Host "     - Learner: learner@test.com / TestPass123!" -ForegroundColor Gray
Write-Host "  4. Follow the testing checklist in docs/MANUAL_TESTING_GUIDE.md" -ForegroundColor White
Write-Host ""
Write-Host "💡 Tip: To stop services, close the PowerShell windows or press Ctrl+C" -ForegroundColor Yellow
Write-Host ""

