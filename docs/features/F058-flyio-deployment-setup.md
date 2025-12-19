# F058: Fly.io Deployment Setup

**Feature Code**: F058
**Created**: 2025-12-17
**Phase**: 16 - Production Deployment
**Status**: Not Started

---

## Description

Configure Fly.io deployment with fly.toml, database setup, environment variables, and automated deployments.

## Success Criteria

- [ ] fly.toml configuration file
- [ ] PostgreSQL database provisioned on Fly.io
- [ ] Environment secrets configured
- [ ] Health checks configured
- [ ] Auto-scaling rules defined
- [ ] Deployment via `fly deploy`

---

## Tasks

### Task 1: Create fly.toml Configuration

**Implementation Plan**:

Create `fly.toml`:
```toml
app = "polyladder"
primary_region = "iad"

[build]
  dockerfile = "docker/Dockerfile.prod"

[env]
  NODE_ENV = "production"
  LOG_LEVEL = "info"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[services]]
  protocol = "tcp"
  internal_port = 3000

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

[[services.http_checks]]
  interval = 10000
  timeout = 2000
  grace_period = "5s"
  method = "get"
  path = "/health"

[mounts]
  source = "postgres_data"
  destination = "/data"
```

**Files Created**: `fly.toml`

---

### Task 2: Create Deployment Scripts

**Implementation Plan**:

Create `scripts/deploy-flyio.sh`:
```bash
#!/bin/bash
set -e

echo "🚀 Deploying PolyLadder to Fly.io..."

# Check if fly CLI installed
if ! command -v fly &> /dev/null; then
    echo "❌ fly CLI not found. Install: https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

# Check if logged in
if ! fly auth whoami &> /dev/null; then
    echo "❌ Not logged in. Run: fly auth login"
    exit 1
fi

# Create app if doesn't exist
if ! fly apps list | grep -q polyladder; then
    echo "📦 Creating app..."
    fly apps create polyladder
fi

# Create PostgreSQL if doesn't exist
if ! fly postgres list | grep -q polyladder-db; then
    echo "🗄️  Creating PostgreSQL database..."
    fly postgres create --name polyladder-db --region iad --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1
fi

# Attach database
echo "🔗 Attaching database..."
fly postgres attach polyladder-db --app polyladder

# Set secrets
echo "🔐 Setting secrets..."
fly secrets set JWT_SECRET=$(openssl rand -base64 32) --app polyladder

# Deploy
echo "🚢 Deploying application..."
fly deploy --ha=false

echo "✅ Deployment complete!"
echo "🌐 App URL: https://polyladder.fly.dev"
```

**Files Created**: `scripts/deploy-flyio.sh`

---

### Task 3: Create Migration Runner

**Implementation Plan**:

Create `scripts/run-migrations.sh`:
```bash
#!/bin/bash
# Run database migrations on Fly.io

fly ssh console --app polyladder -C "cd /app && pnpm --filter @polyladder/db migrate:up"
```

**Files Created**: `scripts/run-migrations.sh`

---

## Dependencies

- **Blocks**: None (final deployment)
- **Depends on**: F000-F057

---

## Notes

- Fly.io free tier: 1 shared CPU, 256MB RAM, 1GB storage
- Auto-scale to zero when idle (cost optimization)
- PostgreSQL separate instance for data persistence
- Secrets managed via `fly secrets set`
- Deploy with: `fly deploy`
