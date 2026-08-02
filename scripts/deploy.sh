#!/usr/bin/env bash
#
# Deploy the current checkout to the Hetzner host.
#
# Run by the self-hosted GitHub Actions runner on every push to main (see
# .github/workflows/ci.yml), and safe to run by hand on the box:
#
#   cd /opt/actions-runner/_work/point-of-sale/point-of-sale && ./scripts/deploy.sh
#
# Order matters. Migrations are applied *before* the new container takes over,
# which is the safe direction for additive changes: the old code keeps serving
# against a schema that is a superset of what it knows. A destructive migration
# (dropping or renaming a column still read by the running build) would break
# that window — ship those as expand/contract across two deploys.
#
# If the new container fails its health check, the previous image is put back and
# the script exits non-zero, so the GitHub Actions run goes red on a bad deploy
# instead of leaving a broken app up.

set -euo pipefail

readonly ENV_FILE=/etc/pos/app.env
readonly PROJECT=pos
readonly HEALTH_URL=http://127.0.0.1:3000/api/health
readonly HEALTH_ATTEMPTS=30
readonly HEALTH_INTERVAL=5

cd "$(dirname "$0")/.."

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -r "$ENV_FILE" ]] || die "$ENV_FILE is missing or unreadable by $(whoami)."

compose() {
  docker compose \
    --project-name "$PROJECT" \
    --env-file "$ENV_FILE" \
    --file docker/docker-compose.yml \
    "$@"
}

# Poll until the app answers 200 on /api/health, which only happens once the
# config validates *and* Neon answers a SELECT 1.
wait_for_health() {
  local attempt=1
  while (( attempt <= HEALTH_ATTEMPTS )); do
    if curl -fsS --max-time 10 "$HEALTH_URL" >/dev/null 2>&1; then
      curl -sS "$HEALTH_URL"
      echo
      return 0
    fi
    printf '  health check %d/%d …\n' "$attempt" "$HEALTH_ATTEMPTS"
    sleep "$HEALTH_INTERVAL"
    (( attempt++ ))
  done
  return 1
}

rollback() {
  warn "Rolling back to the previous image."
  if docker image inspect pos-app:previous >/dev/null 2>&1; then
    docker tag pos-app:previous pos-app:current
    compose up -d --no-build app
    if wait_for_health; then
      warn "Previous version is back up."
    else
      warn "Previous version is also unhealthy — check: docker compose -p $PROJECT logs app"
    fi
  else
    warn "No previous image to roll back to (this looks like the first deploy)."
  fi
}

APP_COMMIT_SHA="${GIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
export APP_COMMIT_SHA
log "Deploying ${APP_COMMIT_SHA:0:7}"

log "Tagging the running image as the rollback point"
if docker image inspect pos-app:current >/dev/null 2>&1; then
  docker tag pos-app:current pos-app:previous
  echo "  pos-app:current -> pos-app:previous"
else
  echo "  no current image; first deploy"
fi

log "Building"
compose build app migrate

log "Applying database migrations"
compose --profile tools run --rm --no-deps migrate \
  || die "Migrations failed — the running app was left untouched."

log "Starting the new containers"
compose up -d --no-build --remove-orphans

log "Waiting for the app to report healthy"
if ! wait_for_health; then
  rollback
  die "New build never became healthy; rolled back."
fi

log "Reloading Caddy"
compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
  || warn "Caddy reload failed; it is still serving its last good config."

log "Pruning dangling images"
docker image prune -f >/dev/null || true

log "Deployed ${APP_COMMIT_SHA:0:7}"
