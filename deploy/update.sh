#!/bin/sh
# Pulls the latest code and switches to it without taking the site down.
# The automatic deploy from GitHub runs this; you can also run it yourself from the project folder.
#
# 1. Build the new version while the current one keeps serving customers.
# 2. Run database migrations. If one fails, stop here: the live site is untouched.
# 3. Switch to the new version and wait for it to pass its health check.
# 4. If it never becomes healthy, go back to the previous version automatically.
set -eu
cd "$(dirname "$0")/.."

previous="$(git rev-parse HEAD)"
git pull --ff-only
current="$(git rev-parse HEAD)"

app_health() { docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || echo missing; }

wait_healthy() {
  for _ in $(seq 1 36); do
    [ "$(app_health)" = healthy ] && return 0
    sleep 5
  done
  return 1
}

echo "Building $(git rev-parse --short HEAD) while the current version keeps running..."
if ! docker compose build; then
  echo "The new version did not build, so nothing was switched. The live site is still on $(git rev-parse --short "$previous")." >&2
  git reset --hard -q "$previous"
  exit 1
fi

echo "Running database migrations..."
if ! docker compose run --rm migrate; then
  echo "A migration failed, so nothing was switched. The live site is still on $(git rev-parse --short "$previous")." >&2
  git reset --hard -q "$previous"
  exit 1
fi

echo "Switching to the new version..."
if docker compose up -d --remove-orphans && wait_healthy; then
  docker image prune -f >/dev/null
  echo "Updated to $(git rev-parse --short HEAD)."
  exit 0
fi

echo "The new version did not pass its health check. Going back to $(git rev-parse --short "$previous")..." >&2
docker compose logs --tail 30 app >&2 || true
git reset --hard -q "$previous"
docker compose up -d --build --remove-orphans || true
wait_healthy || echo "The previous version is not healthy either. Check: docker compose logs app" >&2
echo "Rolled back from $(git rev-parse --short "$current")." >&2
exit 1
