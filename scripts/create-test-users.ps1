# PowerShell script to create test users for manual testing

$API_URL = "http://localhost:3000/api/v1"

Write-Host "👤 Creating test users for manual testing..." -ForegroundColor Cyan
Write-Host ""

# Check if API is running
Write-Host "📋 Checking API server..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$API_URL/health" -Method Get -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✅ API server is running" -ForegroundColor Green
} catch {
    Write-Host "❌ API server is not running. Please start it first:" -ForegroundColor Red
    Write-Host "   pnpm --filter @polyladder/api dev" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Create operator user
Write-Host "🔧 Creating operator user..." -ForegroundColor Yellow
try {
    $operatorBody = @{
        email = "operator@test.com"
        password = "TestPass123!"
        role = "operator"
    } | ConvertTo-Json

    $operatorResponse = Invoke-RestMethod -Uri "$API_URL/auth/register" -Method Post -ContentType "application/json" -Body $operatorBody
    Write-Host "✅ Operator user created: operator@test.com" -ForegroundColor Green
} catch {
    $errorMessage = $_.Exception.Response.StatusCode.value__
    if ($errorMessage -eq 409) {
        Write-Host "ℹ️  Operator user already exists: operator@test.com" -ForegroundColor Gray
    } else {
        Write-Host "❌ Failed to create operator user: $_" -ForegroundColor Red
    }
}

# Create learner user
Write-Host "📚 Creating learner user..." -ForegroundColor Yellow
try {
    $learnerBody = @{
        email = "learner@test.com"
        password = "TestPass123!"
        role = "learner"
    } | ConvertTo-Json

    $learnerResponse = Invoke-RestMethod -Uri "$API_URL/auth/register" -Method Post -ContentType "application/json" -Body $learnerBody
    Write-Host "✅ Learner user created: learner@test.com" -ForegroundColor Green
} catch {
    $errorMessage = $_.Exception.Response.StatusCode.value__
    if ($errorMessage -eq 409) {
        Write-Host "ℹ️  Learner user already exists: learner@test.com" -ForegroundColor Gray
    } else {
        Write-Host "❌ Failed to create learner user: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "✅ Test users ready!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Login credentials:" -ForegroundColor Cyan
Write-Host "  Operator: operator@test.com / TestPass123!" -ForegroundColor White
Write-Host "  Learner: learner@test.com / TestPass123!" -ForegroundColor White
Write-Host ""

