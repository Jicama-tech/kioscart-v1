# KiosCart — Server Deployment Guide

> Server: Ubuntu (eventshadmin@srv866262)
> Path: `/home/eventshadmin/kioscart/kioscart-v1/`

---

## Table of Contents

1. [Initial Server Setup](#1-initial-server-setup)
2. [Backend Deployment](#2-backend-deployment)
3. [Frontend Deployment](#3-frontend-deployment)
4. [Nginx Configuration](#4-nginx-configuration)
5. [SSL with Certbot](#5-ssl-with-certbot)
6. [Custom Domain Setup](#6-custom-domain-setup)
7. [Making Changes & Redeploying](#7-making-changes--redeploying)
8. [Useful Commands](#8-useful-commands)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Initial Server Setup

### Prerequisites

```bash
# Install Node.js (v18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Install Certbot (for SSL)
sudo apt install -y certbot python3-certbot-nginx
```

### Clone / Copy Project to Server

```bash
cd /home/eventshadmin/kioscart
git clone <your-repo-url> kioscart-v1
# OR copy files via scp/rsync
```

---

## 2. Backend Deployment

### Directory: `/home/eventshadmin/kioscart/kioscart-v1/backend/`

### Step-by-step:

```bash
cd /home/eventshadmin/kioscart/kioscart-v1/backend

# 1. Install dependencies
npm install

# 2. Create .env file (copy from your local or set values)
nano .env
# Required variables:
#   PORT=3000
#   MONGODB_URI=mongodb://localhost:27017/kioscart
#   JWT_SECRET=your_jwt_secret
#   FRONTEND_URL=https://kioscart.com
#   (add all other required env vars)

# 3. Build the project
npm run build

# 4. Create uploads directory and webp cache
mkdir -p uploads/.webp-cache

# 5. Copy uploads from old backend (if migrating)
cp -r /home/eventshadmin/backend/EMS-Backend/uploads/* /home/eventshadmin/kioscart/kioscart-v1/backend/uploads/

# 6. Start with PM2
pm2 start dist/main.js --name kioscart-backend

# 7. Save PM2 process list (auto-restart on reboot)
pm2 save
pm2 startup  # follow the printed command
```

---

## 3. Frontend Deployment

### Directory: `/home/eventshadmin/kioscart/kioscart-v1/frontend/`

### Step-by-step:

```bash
cd /home/eventshadmin/kioscart/kioscart-v1/frontend

# 1. Install dependencies
npm install

# 2. Create .env file
nano .env
# Required:
#   VITE_API_URL=https://kioscart.com/api

# 3. Build for production
npm run build
# This creates a dist/ folder with static files

# 4. (Optional) Serve with PM2 using a static server
# Usually Nginx serves the dist/ folder directly (see Nginx section)
```

---

## 4. Nginx Configuration

### Create Nginx config:

```bash
sudo nano /etc/nginx/sites-available/kioscart
```

### Main domain config (`kioscart.com`):

```nginx
server {
    listen 80;
    server_name kioscart.com www.kioscart.com;

    # Frontend — serve static files from dist/
    root /home/eventshadmin/kioscart/kioscart-v1/frontend/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # API reverse proxy — routes /api/* to backend
    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10M;
    }

    # SPA fallback — all routes go to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Enable and test:

```bash
# Create symlink to enable the site
sudo ln -s /etc/nginx/sites-available/kioscart /etc/nginx/sites-enabled/

# Test config syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## 5. SSL with Certbot

```bash
# Get SSL certificate for all your domains
sudo certbot --nginx -d kioscart.com -d www.kioscart.com

# For custom domains (run separately for each)
sudo certbot --nginx -d thefoxsg.com -d www.thefoxsg.com
sudo certbot --nginx -d xcionasia.com -d www.xcionasia.com

# Auto-renewal is set up automatically. Test it:
sudo certbot renew --dry-run
```

Certbot will automatically modify your Nginx config to add SSL (port 443) and redirect HTTP to HTTPS.

---

## 6. Custom Domain Setup

Adding a new custom domain (e.g., `newstore.com`) requires changes in **4 places**:

### Step 1: DNS — Point domain to your server

At your domain registrar, add an **A record**:
```
Type: A
Name: @
Value: <your-server-IP>

Type: A
Name: www
Value: <your-server-IP>
```

### Step 2: Frontend — `frontend/src/App.tsx`

Add the domain to `CUSTOM_DOMAIN_CONFIG`:

```typescript
const CUSTOM_DOMAIN_CONFIG: Record<
  string,
  { slug: string; title: string; description: string }
> = {
  // ... existing domains ...
  'newstore.com': {
    slug: 'newstore-slug',    // must match the store's slug in DB
    title: 'New Store Name',
    description: 'Store description for SEO',
  },
  'www.newstore.com': {
    slug: 'newstore-slug',
    title: 'New Store Name',
    description: 'Store description for SEO',
  },
};
```

Then rebuild frontend: `npm run build`

### Step 3: Backend — `backend/src/main.ts`

Add the domain to `ALLOWED_DOMAINS`:

```typescript
const ALLOWED_DOMAINS = new Set([
  // ... existing domains ...
  "https://newstore.com",
  "https://www.newstore.com",
]);
```

Then rebuild backend: `npm run build`, then `pm2 restart kioscart-backend`

### Step 4: Nginx — Add server block with OG tag overrides

```bash
sudo nano /etc/nginx/sites-available/kioscart
```

Add a new server block. Use `sub_filter` to replace OG meta tags for social media previews:

```nginx
server {
    listen 80;
    server_name newstore.com www.newstore.com;

    root /home/eventshadmin/kioscart/kioscart-v1/frontend/dist;
    index index.html;

    # Replace OG tags for this custom domain (for social media previews)
    sub_filter '<title>KiosCart - Online Platform for Kiosk and Cart Management</title>' '<title>New Store - Tagline Here</title>';
    sub_filter 'content="KiosCart - E-Shop Management"' 'content="New Store - Tagline Here"';
    sub_filter 'content="Online Platform for Kiosk and Cart Management"' 'content="Your store description here"';
    sub_filter 'content="https://kioscart.com/"' 'content="https://newstore.com/"';
    sub_filter 'content="https://kioscart.com/KiosCart.png"' 'content="https://newstore.com/newstore-og.png"';
    sub_filter 'content="KiosCart"' 'content="New Store"';
    sub_filter '<link rel="icon" href="/KiosCart.png" type="image/png" />' '<link rel="icon" href="/newstore-og.png" type="image/png" />';
    sub_filter_once off;
    sub_filter_types text/html;

    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10M;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Example — TheFoxSg Nginx block:**

```nginx
server {
    listen 80;
    server_name thefoxsg.com www.thefoxsg.com;

    root /home/eventshadmin/kioscart/kioscart-v1/frontend/dist;
    index index.html;

    sub_filter '<title>KiosCart - Online Platform for Kiosk and Cart Management</title>' '<title>TheFoxSg - #SnackWithNoRegret</title>';
    sub_filter 'content="KiosCart - E-Shop Management"' 'content="TheFoxSg - #SnackWithNoRegret"';
    sub_filter 'content="Online Platform for Kiosk and Cart Management"' 'content="Delicious snacks with no regret! Premium quality snacks delivered to your doorstep."';
    sub_filter 'content="https://kioscart.com/"' 'content="https://thefoxsg.com/"';
    sub_filter 'content="https://kioscart.com/KiosCart.png"' 'content="https://thefoxsg.com/thefoxsg-og.png"';
    sub_filter 'content="KiosCart"' 'content="TheFoxSg"';
    sub_filter '<link rel="icon" href="/KiosCart.png" type="image/png" />' '<link rel="icon" href="/thefoxsg-og.png" type="image/png" />';
    sub_filter_once off;
    sub_filter_types text/html;

    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10M;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
```

Then:
```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d newstore.com -d www.newstore.com
```

---

## 7. Making Changes & Redeploying

### If you changed FRONTEND code:

```bash
# On your local machine — push changes
git add .
git commit -m "your changes"
git push

# On the server
cd /home/eventshadmin/kioscart/kioscart-v1/frontend
git pull
npm install          # only if dependencies changed
npm run build        # rebuilds dist/
# Done! Nginx serves the new dist/ automatically. No restart needed.
```

### If you changed BACKEND code:

```bash
# On your local machine — push changes
git add .
git commit -m "your changes"
git push

# On the server
cd /home/eventshadmin/kioscart/kioscart-v1/backend
git pull
npm install          # only if dependencies changed
npm run build        # rebuilds dist/
pm2 restart kioscart-backend
```

### If you changed .env files:

```bash
# Backend
pm2 restart kioscart-backend

# Frontend (env is baked into build)
cd /home/eventshadmin/kioscart/kioscart-v1/frontend
npm run build
```

### If you changed Nginx config:

```bash
sudo nginx -t                  # always test first!
sudo systemctl reload nginx
```

### Quick redeploy script (run on server):

```bash
#!/bin/bash
# Save as: /home/eventshadmin/kioscart/redeploy.sh
# Usage: bash redeploy.sh [frontend|backend|both]

PROJ="/home/eventshadmin/kioscart/kioscart-v1"

deploy_frontend() {
    echo "=== Deploying Frontend ==="
    cd "$PROJ/frontend"
    git pull
    npm install
    rm -rf dist
    npm run build
    echo "Frontend deployed!"
}

deploy_backend() {
    echo "=== Deploying Backend ==="
    cd "$PROJ/backend"
    git pull
    npm install
    npm run build
    pm2 restart kioscart-backend
    echo "Backend deployed!"
}

case "${1:-both}" in
    frontend) deploy_frontend ;;
    backend)  deploy_backend ;;
    both)     deploy_frontend && deploy_backend ;;
    *)        echo "Usage: bash redeploy.sh [frontend|backend|both]" ;;
esac
```

---

## 8. Useful Commands

### PM2

```bash
pm2 status                        # check all processes
pm2 logs kioscart-backend         # view logs
pm2 logs kioscart-backend --lines 100  # last 100 lines
pm2 restart kioscart-backend      # restart backend
pm2 stop kioscart-backend         # stop backend
pm2 delete kioscart-backend       # remove from PM2
pm2 monit                         # real-time monitoring
```

### Nginx

```bash
sudo nginx -t                     # test config
sudo systemctl reload nginx       # reload (no downtime)
sudo systemctl restart nginx      # full restart
sudo systemctl status nginx       # check status
sudo tail -f /var/log/nginx/error.log    # error logs
sudo tail -f /var/log/nginx/access.log   # access logs
```

### SSL

```bash
sudo certbot certificates         # list all certificates
sudo certbot renew --dry-run      # test renewal
sudo certbot --nginx -d domain.com  # add new domain
```

### MongoDB

```bash
mongosh                           # connect to MongoDB shell
mongosh --eval "db.stats()"       # quick DB stats
```

---

## 9. Troubleshooting

### Backend not starting?
```bash
pm2 logs kioscart-backend --lines 50   # check error logs
cat /home/eventshadmin/kioscart/kioscart-v1/backend/.env  # verify env vars
node -e "require('sharp')"             # check sharp is working
```

### Frontend showing blank page?
```bash
ls -la /home/eventshadmin/kioscart/kioscart-v1/frontend/dist/  # check dist exists
cat /home/eventshadmin/kioscart/kioscart-v1/frontend/.env      # check VITE_API_URL
```

### Images not loading?
```bash
ls -la /home/eventshadmin/kioscart/kioscart-v1/backend/uploads/   # check uploads exist
ls -la /home/eventshadmin/kioscart/kioscart-v1/backend/.webp-cache/  # check cache dir
```

### CORS errors?
- Check `ALLOWED_DOMAINS` in `backend/src/main.ts`
- Make sure both `https://domain.com` and `https://www.domain.com` are listed

### 502 Bad Gateway?
```bash
pm2 status                  # is backend running?
curl http://localhost:3000   # can backend be reached locally?
```

### SSL certificate expired?
```bash
sudo certbot renew
sudo systemctl reload nginx
```
