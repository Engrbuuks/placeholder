#!/usr/bin/env bash
# Sets up the whole platform on a fresh Ubuntu server (made for Oracle Cloud's free server; works on Hetzner too).
# Run it from the project folder:   sudo bash deploy/install.sh
# With your own domain:             sudo DOMAIN=app.example.com bash deploy/install.sh
# Safe to run again: it keeps your existing .env and secrets, and only adds what is missing.
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "Run this with sudo:  sudo bash deploy/install.sh"
[ -f docker-compose.yml ] || fail "Run this from the project folder (the one with docker-compose.yml)."

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "Docker is already installed."
  else
    say "Installing Docker"
    apt-get update -y
    apt-get install -y ca-certificates curl
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
  # Lets your normal login run docker without sudo, which the automatic deploy from GitHub needs.
  if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then usermod -aG docker "$SUDO_USER"; fi
}

# Oracle's Ubuntu images block every port except SSH inside the server itself, as well as in the Oracle console.
# This opens 80 and 443 inside the server; the guide covers the console side.
open_firewall() {
  say "Opening ports 80 and 443"
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
  fi
  if command -v iptables >/dev/null 2>&1; then
    for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
      # shellcheck disable=SC2086
      iptables -C INPUT $rule -m state --state NEW -j ACCEPT 2>/dev/null || iptables -I INPUT 1 $rule -m state --state NEW -j ACCEPT
    done
    if command -v netfilter-persistent >/dev/null 2>&1; then netfilter-persistent save >/dev/null 2>&1 || true; fi
  fi
}

public_ip() {
  local ip=""
  for url in https://api.ipify.org https://ifconfig.me https://icanhazip.com; do
    ip="$(curl -fsS --max-time 5 "$url" 2>/dev/null | tr -d '[:space:]')" && [[ "$ip" =~ ^[0-9]+(\.[0-9]+){3}$ ]] && break
    ip=""
  done
  echo "$ip"
}

random_hex() { openssl rand -hex "$1"; }

# Adds KEY=value to .env only when KEY is not there yet, so secrets never change on a second run.
ensure() {
  local key="$1" value="$2"
  grep -q "^${key}=" .env || printf '%s=%s\n' "$key" "$value" >> .env
}

write_env() {
  say "Writing settings to .env"
  touch .env
  chmod 600 .env
  local site="${DOMAIN:-}"
  if [ -z "$site" ]; then
    site="$(grep '^SITE_ADDRESS=' .env | cut -d= -f2- || true)"
  fi
  if [ -z "$site" ]; then
    local ip
    ip="${SERVER_IP:-$(public_ip)}"
    [ -n "$ip" ] || fail "Could not find this server's public IP. Run again with DOMAIN=your.domain or SERVER_IP=1.2.3.4"
    # sslip.io turns 1.2.3.4 into a real web address, so HTTPS works before you buy a domain.
    site="${ip//./-}.sslip.io"
  fi
  if grep -q '^SITE_ADDRESS=' .env; then
    sed -i "s|^SITE_ADDRESS=.*|SITE_ADDRESS=${site}|; s|^APP_URL=.*|APP_URL=https://${site}|" .env
  fi
  ensure SITE_ADDRESS "$site"
  ensure APP_URL "https://${site}"
  ensure DB_OWNER_PASSWORD "$(random_hex 24)"
  ensure APP_DB_PASSWORD "$(random_hex 24)"
  ensure CRON_SECRET "$(random_hex 32)"
  ensure ENCRYPTION_KEY "$(openssl rand -base64 32)"
  ensure WHATSAPP_VERIFY_TOKEN "$(random_hex 24)"
  ensure WHATSAPP_APP_SECRET ""
  ensure WHATSAPP_GRAPH_VERSION "v21.0"
  ensure ANTHROPIC_API_KEY ""
  ensure RESEND_API_KEY ""
  ensure EMAIL_FROM "Placeholder <alerts@${site}>"
  ensure BACKUP_KEEP_DAYS "7"
}

start() {
  say "Building and starting (the first build takes a few minutes)"
  docker compose up -d --build
  say "Waiting for the app to answer"
  for _ in $(seq 1 60); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null)" = healthy ]; then
      return 0
    fi
    sleep 5
  done
  docker compose logs --tail 40 app migrate
  fail "The app did not become healthy. The logs above say why."
}

[ "${INSTALL_SKIP_DOCKER:-}" = 1 ] || install_docker
[ "${INSTALL_SKIP_FIREWALL:-}" = 1 ] || open_firewall
write_env
[ "${INSTALL_SKIP_START:-}" = 1 ] || start

site="$(grep '^SITE_ADDRESS=' .env | cut -d= -f2-)"
say "Done. Your platform is at https://${site}"
cat <<EOF

What happens now
  The app, database, every minute worker, HTTPS and daily backups are all running, and restart on their own.
  Backups are saved in ${PROJECT_DIR}/backups (7 days kept).

If the address does not open
  In the Oracle console, open your instance's subnet, then its security list, and add ingress rules
  for TCP ports 80 and 443 from 0.0.0.0/0. The certificate is issued the first time the address is reached.

Optional keys (edit ${PROJECT_DIR}/.env, then run: docker compose up -d)
  ANTHROPIC_API_KEY  for AI answers      RESEND_API_KEY  for alert emails
  WHATSAPP_APP_SECRET for WhatsApp       The webhook verify token is already set in .env.
EOF
