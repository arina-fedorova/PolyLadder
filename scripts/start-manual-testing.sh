#!/bin/bash

set -e

echo "🚀 Starting PolyLadder for manual testing..."
echo ""

# Check if database is running
echo "📋 Checking database status..."
if ! docker ps --filter "name=polyladder-db-dev" --format "{{.Names}}" | grep -q "polyladder-db-dev"; then
    echo "🗄️  Starting database..."
    docker-compose -f docker/docker-compose.yml up -d db
    
    echo "⏳ Waiting for database to be ready..."
    max_attempts=30
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        sleep 1
        attempt=$((attempt + 1))
        if docker exec polyladder-db-dev pg_isready -U dev -d polyladder >/dev/null 2>&1; then
            echo "✅ Database is ready"
            break
        fi
    done
    
    if [ $attempt -eq $max_attempts ]; then
        echo "❌ Database failed to start. Aborting."
        exit 1
    fi
else
    echo "✅ Database is already running"
fi

# Check migrations
echo "📊 Checking database migrations..."
export DATABASE_URL="postgres://dev:dev@localhost:5432/polyladder"
pnpm --filter @polyladder/db migrate:up --silent

# Check .env files
echo "⚙️  Checking environment files..."

if [ ! -f "packages/api/.env" ]; then
    echo "⚠️  packages/api/.env not found. Run setup-local-dev.sh first."
    exit 1
fi

if [ ! -f "packages/web/.env" ]; then
    echo "⚠️  packages/web/.env not found. Run setup-local-dev.sh first."
    exit 1
fi

echo "✅ Environment files found"

echo ""
echo "🎯 Starting services..."
echo ""
echo "Services will start in separate terminal windows:"
echo "  - API Server: http://localhost:3000"
echo "  - Web App: http://localhost:5173"
echo "  - Refinement Service: (optional)"
echo ""

# Detect terminal emulator
if command -v gnome-terminal >/dev/null 2>&1; then
    TERMINAL="gnome-terminal"
    TERMINAL_OPTS="--"
elif command -v xterm >/dev/null 2>&1; then
    TERMINAL="xterm"
    TERMINAL_OPTS="-e"
elif command -v osascript >/dev/null 2>&1; then
    TERMINAL="osascript"
    TERMINAL_OPTS=""
else
    echo "⚠️  Could not detect terminal emulator. Starting in current terminal."
    TERMINAL=""
fi

# Start API server
echo "📡 Starting API server..."
if [ -n "$TERMINAL" ]; then
    if [ "$TERMINAL" = "osascript" ]; then
        osascript -e "tell app \"Terminal\" to do script \"cd '$PWD' && pnpm --filter @polyladder/api dev\""
    elif [ "$TERMINAL" = "gnome-terminal" ]; then
        gnome-terminal -- bash -c "cd '$PWD' && pnpm --filter @polyladder/api dev; exec bash"
    else
        $TERMINAL $TERMINAL_OPTS bash -c "cd '$PWD' && pnpm --filter @polyladder/api dev; exec bash" &
    fi
else
    echo "Run in separate terminal: pnpm --filter @polyladder/api dev"
fi

sleep 2

# Start Web app
echo "🌐 Starting Web application..."
if [ -n "$TERMINAL" ]; then
    if [ "$TERMINAL" = "osascript" ]; then
        osascript -e "tell app \"Terminal\" to do script \"cd '$PWD' && pnpm --filter @polyladder/web dev\""
    elif [ "$TERMINAL" = "gnome-terminal" ]; then
        gnome-terminal -- bash -c "cd '$PWD' && pnpm --filter @polyladder/web dev; exec bash"
    else
        $TERMINAL $TERMINAL_OPTS bash -c "cd '$PWD' && pnpm --filter @polyladder/web dev; exec bash" &
    fi
else
    echo "Run in separate terminal: pnpm --filter @polyladder/web dev"
fi

echo ""
echo "✅ Services started!"
echo ""
echo "📝 Manual Testing Guide:"
echo "  1. Wait for services to start (check terminal windows for startup messages)"
echo "  2. Open http://localhost:5173 in your browser"
echo "  3. Register test users:"
echo "     - Operator: operator@test.com / TestPass123!"
echo "     - Learner: learner@test.com / TestPass123!"
echo "  4. Follow the testing checklist in docs/MANUAL_TESTING_GUIDE.md"
echo ""
echo "💡 Tip: To stop services, close the terminal windows or press Ctrl+C"
echo ""

