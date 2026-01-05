# F058: Fly.io Deployment Setup

**Feature Code**: F058
**Created**: 2025-12-17
**Completed**: 2026-01-05
**Phase**: 16 - Production Deployment
**Status**: Completed

---

## Description

Configure Fly.io deployment with fly.toml, database setup, environment variables, and automated deployments.

## Success Criteria

- [x] fly.toml configuration file
- [x] PostgreSQL database provisioned on Fly.io
- [x] Environment secrets configured
- [x] Health checks configured
- [x] Auto-scaling rules defined
- [x] Deployment via `fly deploy`

---

## Implementation Summary

### Files Created

| File                        | Description                      |
| --------------------------- | -------------------------------- |
| `fly.toml`                  | Fly.io application configuration |
| `scripts/deploy-flyio.sh`   | Deployment script (bash)         |
| `scripts/deploy-flyio.ps1`  | Deployment script (PowerShell)   |
| `scripts/flyio-migrate.sh`  | Migration runner (bash)          |
| `scripts/flyio-migrate.ps1` | Migration runner (PowerShell)    |

---

### Task 1: Create fly.toml Configuration

**File**: `fly.toml`

Fly.io configuration with:

- App name: `polyladder`
- Primary region: `iad` (US East)
- Dockerfile: `docker/Dockerfile.prod`
- Internal port: 3000
- Force HTTPS enabled
- Auto-scaling: stop when idle, auto-start on request
- Health checks at `/health` endpoint
- Concurrency limits: 25 hard, 20 soft
- VM: 512MB RAM, shared CPU

```toml
app = "polyladder"
primary_region = "iad"

[build]
  dockerfile = "docker/Dockerfile.prod"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0
```

---

### Task 2: Create Deployment Scripts

**Files**: `scripts/deploy-flyio.sh`, `scripts/deploy-flyio.ps1`

Cross-platform deployment scripts with:

- fly CLI installation check
- Authentication verification
- First-time setup with `--init` flag:
  - Create app
  - Create PostgreSQL database
  - Attach database to app
  - Generate and set JWT secrets
- Deploy application with `ha=false` for cost savings

**Usage**:

```bash
# First-time setup
./scripts/deploy-flyio.sh --init

# Subsequent deploys
./scripts/deploy-flyio.sh
```

**PowerShell**:

```powershell
# First-time setup
.\scripts\deploy-flyio.ps1 -Init

# Subsequent deploys
.\scripts\deploy-flyio.ps1
```

---

### Task 3: Create Migration Runner Scripts

**Files**: `scripts/flyio-migrate.sh`, `scripts/flyio-migrate.ps1`

Migration runner scripts with commands:

- `up`: Run pending migrations (default)
- `down`: Rollback last migration
- `status`: Show migration status

**Usage**:

```bash
./scripts/flyio-migrate.sh up
./scripts/flyio-migrate.sh status
./scripts/flyio-migrate.sh down
```

---

## Deployment Guide

### Prerequisites

1. Install fly CLI: https://fly.io/docs/flyctl/install/
2. Create Fly.io account: https://fly.io/
3. Login: `fly auth login`

### First-Time Deployment

```bash
# 1. Run first-time setup (creates app, database, secrets)
./scripts/deploy-flyio.sh --init

# 2. Run migrations
./scripts/flyio-migrate.sh up

# 3. Verify deployment
fly status --app polyladder
fly logs --app polyladder
```

### Subsequent Deployments

```bash
# Deploy new version
./scripts/deploy-flyio.sh

# Run migrations if needed
./scripts/flyio-migrate.sh up
```

### Useful Commands

```bash
# View logs
fly logs --app polyladder

# SSH into container
fly ssh console --app polyladder

# Check status
fly status --app polyladder

# View secrets
fly secrets list --app polyladder

# Set additional secrets
fly secrets set MY_SECRET=value --app polyladder

# Scale machines
fly scale count 2 --app polyladder
```

---

## Environment Variables

### Auto-configured by Fly.io

| Variable       | Description                                        |
| -------------- | -------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string (via postgres attach) |

### Set by Deployment Script

| Variable             | Description                               |
| -------------------- | ----------------------------------------- |
| `JWT_SECRET`         | JWT signing secret (auto-generated)       |
| `JWT_REFRESH_SECRET` | JWT refresh token secret (auto-generated) |

### Set in fly.toml

| Variable    | Value      |
| ----------- | ---------- |
| `NODE_ENV`  | production |
| `LOG_LEVEL` | info       |
| `PORT`      | 3000       |

---

## Cost Optimization

The configuration is optimized for minimal costs:

- Auto-stop machines when idle (`auto_stop_machines = "stop"`)
- Single machine without high availability (`--ha=false`)
- Shared CPU with 512MB RAM
- PostgreSQL: shared-cpu-1x, 1GB storage

### Estimated Costs

- **Free tier**: 1 shared CPU, 256MB RAM, 3GB outbound
- **App (if exceeds free tier)**: ~$5/month
- **PostgreSQL**: ~$15/month (1GB storage)

---

## Dependencies

- **Blocks**: None (final deployment)
- **Depends on**: F000-F057

---

## Notes

- Fly.io automatically provisions SSL certificates
- Database port is not exposed externally
- Use `fly proxy` for local database access if needed
- Secrets are encrypted at rest
- Deploy with: `fly deploy`
