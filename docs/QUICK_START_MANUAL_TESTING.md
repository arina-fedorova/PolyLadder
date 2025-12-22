# Quick Start Guide for Manual Testing

This guide provides the fastest way to get PolyLadder running for manual testing.

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker and Docker Compose

## Step 1: Initial Setup (One-time)

**Windows (PowerShell):**

```powershell
.\scripts\setup-local-dev.ps1
```

**Linux/macOS:**

```bash
chmod +x scripts/setup-local-dev.sh
./scripts/setup-local-dev.sh
```

This will:

- ✅ Check prerequisites
- ✅ Install dependencies
- ✅ Create `.env` files
- ✅ Start database
- ✅ Run migrations

## Step 2: Start Services

**Windows (PowerShell):**

```powershell
.\scripts\start-manual-testing.ps1
```

**Linux/macOS:**

```bash
chmod +x scripts/start-manual-testing.sh
./scripts/start-manual-testing.sh
```

This will:

- ✅ Check database status
- ✅ Verify migrations
- ✅ Start API server (http://localhost:3000)
- ✅ Start Web app (http://localhost:5173)

## Step 3: Create Test Users

Wait for API server to start, then:

**Windows (PowerShell):**

```powershell
.\scripts\create-test-users.ps1
```

**Linux/macOS:**

```bash
chmod +x scripts/create-test-users.sh
./scripts/create-test-users.sh
```

This creates:

- **Operator**: `operator@test.com` / `TestPass123!`
- **Learner**: `learner@test.com` / `TestPass123!`

## Step 4: Start Testing

1. Open http://localhost:5173 in your browser
2. Login with test credentials
3. Follow the testing checklist in `docs/MANUAL_TESTING_GUIDE.md`

## Services URLs

- **Web Application**: http://localhost:5173
- **API Server**: http://localhost:3000
- **API Health Check**: http://localhost:3000/health
- **API Docs**: http://localhost:3000/api/v1 (if available)

## Stopping Services

- Close the terminal windows where services are running
- Or press `Ctrl+C` in each terminal

To stop database:

```bash
docker-compose -f docker/docker-compose.yml down
```

## Troubleshooting

### Database not starting

```bash
# Check if port 5432 is already in use
docker ps -a

# Clean up and restart
docker-compose -f docker/docker-compose.yml down -v
docker-compose -f docker/docker-compose.yml up -d db
```

### API server not responding

1. Check if API is running: `curl http://localhost:3000/health`
2. Check API logs in the terminal window
3. Verify `.env` file exists in `packages/api/`

### Web app not loading

1. Check if Web is running: Open http://localhost:5173
2. Check browser console for errors
3. Verify `.env` file exists in `packages/web/`
4. Verify `VITE_API_URL` points to correct API URL

### Test users already exist

The script will skip creation if users already exist. To recreate:

1. Delete users from database manually, or
2. Reset database: `docker-compose -f docker/docker-compose.yml down -v` and run setup again

## Next Steps

- Read `docs/MANUAL_TESTING_GUIDE.md` for detailed testing checklist
- Review feature documentation in `docs/features/`
- Check API endpoints in `packages/api/src/routes/`
