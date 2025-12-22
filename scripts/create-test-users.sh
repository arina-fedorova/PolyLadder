#!/bin/bash

API_URL="http://localhost:3000/api/v1"

echo "👤 Creating test users for manual testing..."
echo ""

# Check if API is running
echo "📋 Checking API server..."
if curl -s -f "$API_URL/health" >/dev/null 2>&1; then
    echo "✅ API server is running"
else
    echo "❌ API server is not running. Please start it first:"
    echo "   pnpm --filter @polyladder/api dev"
    exit 1
fi

echo ""

# Create operator user
echo "🔧 Creating operator user..."
OPERATOR_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email":"operator@test.com","password":"TestPass123!","role":"operator"}')

HTTP_CODE=$(echo "$OPERATOR_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" -eq 201 ]; then
    echo "✅ Operator user created: operator@test.com"
elif [ "$HTTP_CODE" -eq 409 ]; then
    echo "ℹ️  Operator user already exists: operator@test.com"
else
    echo "❌ Failed to create operator user (HTTP $HTTP_CODE)"
fi

# Create learner user
echo "📚 Creating learner user..."
LEARNER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email":"learner@test.com","password":"TestPass123!","role":"learner"}')

HTTP_CODE=$(echo "$LEARNER_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" -eq 201 ]; then
    echo "✅ Learner user created: learner@test.com"
elif [ "$HTTP_CODE" -eq 409 ]; then
    echo "ℹ️  Learner user already exists: learner@test.com"
else
    echo "❌ Failed to create learner user (HTTP $HTTP_CODE)"
fi

echo ""
echo "✅ Test users ready!"
echo ""
echo "📝 Login credentials:"
echo "  Operator: operator@test.com / TestPass123!"
echo "  Learner: learner@test.com / TestPass123!"
echo ""

