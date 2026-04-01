#!/bin/bash
# Auto-deploy script for KiosCart
# Triggered by GitHub webhook or manually: bash autodeploy.sh [frontend|backend|both]

set -e

PROJ="/home/eventshadmin/kioscart/kioscart-v1"
LOG="/home/eventshadmin/kioscart/deploy.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"
}

deploy_frontend() {
  log "=== Deploying Frontend ==="
  cd "$PROJ/frontend"
  git pull origin main 2>&1 | tee -a "$LOG"
  npm install --legacy-peer-deps 2>&1 | tee -a "$LOG"
  rm -rf dist
  npm run build 2>&1 | tee -a "$LOG"
  log "Frontend deployed!"
}

deploy_backend() {
  log "=== Deploying Backend ==="
  cd "$PROJ/backend"
  git pull origin main 2>&1 | tee -a "$LOG"
  npm install 2>&1 | tee -a "$LOG"
  npm run build 2>&1 | tee -a "$LOG"
  pm2 restart kioscart-backend 2>&1 | tee -a "$LOG"
  log "Backend deployed!"
}

case "${1:-both}" in
  frontend) deploy_frontend ;;
  backend)  deploy_backend ;;
  both)     deploy_frontend && deploy_backend ;;
  *)        echo "Usage: bash autodeploy.sh [frontend|backend|both]" ;;
esac

log "=== Deploy complete ==="
