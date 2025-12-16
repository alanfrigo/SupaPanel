# SupaPanel - Testing Guide

This document describes how to test SupaPanel in different environments.

---

## 🖥️ Local Development

### Prerequisites
- Node.js 18+
- Docker Desktop (for PostgreSQL and Supabase projects)

### Setup

```bash
# 1. Clone and enter directory
cd SupaPanel

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env

# 4. Start local PostgreSQL (port 5433)
docker compose -f docker-compose.dev.yml up -d

# 5. Generate Prisma client
npm run db:generate

# 6. Create database tables
npm run db:push

# 7. Start development server
npm run dev
```

### Verify Features

1. **Access** http://localhost:3000
2. **First visit**: Should redirect to `/auth/register` automatically
3. **Create** an admin account
4. **Try register again**: Should show "Registration Closed"
5. **Login** and create a Supabase project

### Stop Local PostgreSQL

```bash
docker compose -f docker-compose.dev.yml down
```

---

## 🐳 Local Docker Testing (Simulating Production)

### Prerequisites
- Docker Desktop installed and running

### Build and Run

```bash
cd SupaPanel

# 1. Build Docker image
docker build -t alanmf30/supapanel:local .

# 2. Create network
docker network create supapanel-network

# 3. Start PostgreSQL
docker run -d \
  --name supapanel-postgres \
  --network supapanel-network \
  -e POSTGRES_USER=supapanel \
  -e POSTGRES_PASSWORD=testpassword123 \
  -e POSTGRES_DB=supapanel \
  postgres:16-alpine

# 4. Wait for PostgreSQL
sleep 5

# 5. Create data directories
mkdir -p /tmp/supapanel-test/{core,projects}

# 6. Start the panel
docker run -d \
  --name supapanel-panel \
  --network supapanel-network \
  -p 3000:3000 \
  -e SUPAPANEL_MODE=production \
  -e DATABASE_URL="postgresql://supapanel:testpassword123@supapanel-postgres:5432/supapanel" \
  -e NEXTAUTH_SECRET="test-secret-key-for-development-only" \
  -e NEXTAUTH_URL="http://localhost:3000" \
  -e DATA_PATH=/data \
  -v /tmp/supapanel-test/core:/data/core \
  -v /tmp/supapanel-test/projects:/data/projects \
  -v /var/run/docker.sock:/var/run/docker.sock \
  alanmf30/supapanel:local

# 7. Create database tables (first time)
docker exec supapanel-panel npx prisma db push
```

### Verify

```bash
# View logs
docker logs -f supapanel-panel

# Access
open http://localhost:3000
```

### Cleanup

```bash
docker stop supapanel-panel supapanel-postgres
docker rm supapanel-panel supapanel-postgres
docker network rm supapanel-network
rm -rf /tmp/supapanel-test
```

---

## 🖧 Fresh Server Deployment (Without Published Image)

### Prerequisites
- VPS with Ubuntu 22.04+ or Debian 11+
- Root SSH access
- Ports 80, 443, 3000 available

### Clone and Build on Server

```bash
# 1. Connect to server
ssh root@your-server-ip

# 2. Install Docker
curl -sSL https://get.docker.com | sh

# 3. Install Git
apt update && apt install -y git

# 4. Clone repository
git clone https://github.com/alanfrigo/SupaPanel.git /opt/supapanel
cd /opt/supapanel

# 5. Build image on server
docker build -t alanmf30/supapanel:latest .

# 6. Create directory structure
mkdir -p /etc/supapanel/{core,projects,traefik/dynamic,traefik/acme,postgres}
touch /etc/supapanel/traefik/acme/acme.json
chmod 600 /etc/supapanel/traefik/acme/acme.json

# 7. Copy Traefik configs
cp -r traefik/* /etc/supapanel/traefik/

# 8. Generate passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=')
NEXTAUTH_SECRET=$(openssl rand -base64 64 | tr -d '/+=')
SERVER_IP=$(hostname -I | awk '{print $1}')

# 9. Create .env file
cat > /etc/supapanel/.env << EOF
SUPAPANEL_MODE=production
DATABASE_URL=postgresql://supapanel:${POSTGRES_PASSWORD}@postgres:5432/supapanel
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=http://${SERVER_IP}:3000
DATA_PATH=/etc/supapanel
TRAEFIK_ACME_EMAIL=admin@example.com
SUPABASE_CORE_REPO_URL=https://github.com/supabase/supabase
APP_NAME=SupaPanel
APP_URL=http://${SERVER_IP}:3000
EOF

# 10. Create docker-compose.yml
cat > /etc/supapanel/docker-compose.yml << 'COMPOSE'
name: supapanel

networks:
  supapanel-network:
    driver: bridge

services:
  traefik:
    image: traefik:v3.0
    container_name: supapanel-traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ${DATA_PATH}/traefik/traefik.yml:/etc/traefik/traefik.yml:ro
      - ${DATA_PATH}/traefik/dynamic:/etc/traefik/dynamic:ro
      - ${DATA_PATH}/traefik/acme:/etc/traefik/acme
    networks:
      - supapanel-network

  postgres:
    image: postgres:16-alpine
    container_name: supapanel-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: supapanel
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: supapanel
    volumes:
      - ${DATA_PATH}/postgres:/var/lib/postgresql/data
    networks:
      - supapanel-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U supapanel"]
      interval: 5s
      timeout: 5s
      retries: 5

  panel:
    image: alanmf30/supapanel:latest
    container_name: supapanel-panel
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - SUPAPANEL_MODE=production
      - DATABASE_URL=${DATABASE_URL}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - DATA_PATH=/data
      - SUPABASE_CORE_REPO_URL=${SUPABASE_CORE_REPO_URL}
      - APP_NAME=${APP_NAME}
      - APP_URL=${APP_URL}
    volumes:
      - ${DATA_PATH}/core:/data/core
      - ${DATA_PATH}/projects:/data/projects
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - supapanel-network
    depends_on:
      postgres:
        condition: service_healthy
COMPOSE

# 11. Start everything
cd /etc/supapanel
docker compose up -d

# 12. Wait and create tables
sleep 10
docker exec supapanel-panel npx prisma db push

# 13. Get access URL
echo "Access: http://${SERVER_IP}:3000"
```

---

## 🧪 Verification Checklist

### Core Features
- [ ] Accessing `/` redirects to register (first visit) or login
- [ ] Creating admin account works
- [ ] After admin created, `/auth/register` shows "Registration Closed"
- [ ] Login works
- [ ] Dashboard loads

### Project Management
- [ ] "Initialize" button works (clones supabase-core)
- [ ] Creating new Supabase project works
- [ ] Files created in correct path
- [ ] Project deployment (docker compose up) works
- [ ] Project deletion (complete cleanup) works

---

## 🔧 Troubleshooting

### Container won't start
```bash
docker logs supapanel-panel
```

### PostgreSQL connection error
```bash
# Check if postgres is running
docker ps | grep postgres
docker logs supapanel-postgres
```

### Manually create tables
```bash
docker exec supapanel-panel npx prisma db push
```

### Docker socket permission error
```bash
chmod 666 /var/run/docker.sock
```
