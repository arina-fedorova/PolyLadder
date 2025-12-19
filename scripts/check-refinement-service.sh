#!/bin/bash

# Check if refinement service is healthy by examining last checkpoint time

DATABASE_URL=${DATABASE_URL:-"postgres://dev:dev@localhost:5432/polyladder"}
THRESHOLD_SECONDS=${THRESHOLD_SECONDS:-300}  # 5 minutes default

LAST_CHECKPOINT=$(psql "$DATABASE_URL" -t -c "
  SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_checkpoint))::integer
  FROM service_state
  WHERE service_name = 'refinement_service'
" 2>/dev/null | tr -d ' ')

if [ -z "$LAST_CHECKPOINT" ] || [ "$LAST_CHECKPOINT" = "" ]; then
  echo "❌ Service has never run (no checkpoint found)"
  exit 1
fi

if [ "$LAST_CHECKPOINT" -lt "$THRESHOLD_SECONDS" ]; then
  echo "✅ Service is healthy (last checkpoint: ${LAST_CHECKPOINT}s ago)"
  exit 0
else
  echo "⚠️  Service may be stuck (last checkpoint: ${LAST_CHECKPOINT}s ago)"
  exit 2
fi

