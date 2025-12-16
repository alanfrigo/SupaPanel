#!/bin/sh
set -e

# SupaPanel Installation Script
# Usage: curl -sSL https://get.supapanel.io | sh

SUPAPANEL_VERSION="${SUPAPANEL_VERSION:-latest}"
SUPAPANEL_DATA_DIR="/etc/supapanel"

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                              ║"
echo "║   ███████╗██╗   ██╗██████╗  █████╗ ██████╗  █████╗ ███╗   ██╗███████╗██╗     ║"
echo "║   ██╔════╝██║   ██║██╔══██╗██╔══██╗██╔══██╗██╔══██╗████╗  ██║██╔════╝██║     ║"
echo "║   ███████╗██║   ██║██████╔╝███████║██████╔╝███████║██╔██╗ ██║█████╗  ██║     ║"
echo "║   ╚════██║██║   ██║██╔═══╝ ██╔══██║██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║     ║"
echo "║   ███████║╚██████╔╝██║     ██║  ██║██║     ██║  ██║██║ ╚████║███████╗███████╗║"
echo "║   ╚══════╝ ╚═════╝ ╚═╝     ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝║"
echo "║                                                                              ║"
echo "║               Self-Hosted Supabase Management Panel                          ║"
echo "║                                                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$(id -u)" != "0" ]; then
    echo "❌ Error: This script must be run as root" >&2
    exit 1
fi

# Check if Mac OS
if [ "$(uname)" = "Darwin" ]; then
    echo "❌ Error: MacOS is not supported for production installation" >&2
    echo "   For local development, use 'npm run dev' instead" >&2
    exit 1
fi

# Check if running inside a container
if [ -f /.dockerenv ]; then
    echo "❌ Error: Running inside a container is not supported" >&2
    exit 1
fi

# Check if port 80 is available
if command -v lsof > /dev/null 2>&1; then
    if lsof -i :80 -sTCP:LISTEN > /dev/null 2>&1; then
        echo "❌ Error: Port 80 is already in use" >&2
        echo "   Please stop the service using port 80 and try again" >&2
        exit 1
    fi
fi

# Check if port 443 is available
if command -v lsof > /dev/null 2>&1; then
    if lsof -i :443 -sTCP:LISTEN > /dev/null 2>&1; then
        echo "❌ Error: Port 443 is already in use" >&2
        echo "   Please stop the service using port 443 and try again" >&2
        exit 1
    fi
fi

# Check if port 3000 is available (for panel)
if command -v lsof > /dev/null 2>&1; then
    if lsof -i :3000 -sTCP:LISTEN > /dev/null 2>&1; then
        echo "❌ Error: Port 3000 is already in use" >&2
        echo "   Please stop the service using port 3000 and try again" >&2
        exit 1
    fi
fi

echo "✓ Pre-flight checks passed"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$@" > /dev/null 2>&1
}

# Generate random password
generate_password() {
    tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32
}

# Generate random secret
generate_secret() {
    tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 64
}

# Install Docker if not present
echo "📦 Checking Docker installation..."
if command_exists docker; then
    echo "✓ Docker is already installed"
else
    echo "  Installing Docker..."
    curl -sSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "✓ Docker installed successfully"
fi

# Verify Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running" >&2
    echo "   Please start Docker and try again" >&2
    exit 1
fi

# Leave any existing swarm
docker swarm leave --force > /dev/null 2>&1 || true

# Create data directories
echo ""
echo "📁 Creating data directories..."
mkdir -p "${SUPAPANEL_DATA_DIR}"
mkdir -p "${SUPAPANEL_DATA_DIR}/core"
mkdir -p "${SUPAPANEL_DATA_DIR}/projects"
mkdir -p "${SUPAPANEL_DATA_DIR}/traefik"
mkdir -p "${SUPAPANEL_DATA_DIR}/traefik/dynamic"
mkdir -p "${SUPAPANEL_DATA_DIR}/traefik/acme"
mkdir -p "${SUPAPANEL_DATA_DIR}/postgres"
echo "✓ Data directories created at ${SUPAPANEL_DATA_DIR}"

# Generate secrets if they don't exist
echo ""
echo "🔐 Generating secrets..."
ENV_FILE="${SUPAPANEL_DATA_DIR}/.env"

if [ ! -f "$ENV_FILE" ]; then
    POSTGRES_PASSWORD=$(generate_password)
    NEXTAUTH_SECRET=$(generate_secret)
    
    cat > "$ENV_FILE" << EOF
# SupaPanel Configuration
# Generated on $(date -Iseconds)

# Mode
SUPAPANEL_MODE=production

# Database
DATABASE_URL=postgresql://supapanel:${POSTGRES_PASSWORD}@postgres:5432/supapanel
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# Authentication
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=http://localhost:3000

# Data Paths
DATA_PATH=${SUPAPANEL_DATA_DIR}

# Traefik (update with your email for Let's Encrypt)
TRAEFIK_ACME_EMAIL=admin@example.com

# Supabase Core Repository
SUPABASE_CORE_REPO_URL=https://github.com/supabase/supabase

# Application
APP_NAME=SupaPanel
APP_URL=http://localhost:3000
EOF
    echo "✓ Environment file created at ${ENV_FILE}"
else
    echo "✓ Environment file already exists"
fi

# Create Traefik static configuration
echo ""
echo "🔀 Configuring Traefik..."
cat > "${SUPAPANEL_DATA_DIR}/traefik/traefik.yml" << 'EOF'
api:
  dashboard: false
  insecure: false

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true
  websecure:
    address: ":443"
    http:
      tls:
        certResolver: letsencrypt

certificatesResolvers:
  letsencrypt:
    acme:
      email: "${TRAEFIK_ACME_EMAIL}"
      storage: /etc/traefik/acme/acme.json
      tlsChallenge: {}

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: supapanel-network
  file:
    directory: /etc/traefik/dynamic
    watch: true

log:
  level: INFO
EOF

# Create panel routing config for Traefik
cat > "${SUPAPANEL_DATA_DIR}/traefik/dynamic/panel.yml" << 'EOF'
# SupaPanel Panel Routing
# This allows access to the panel via IP:3000 (bypassing Traefik for direct access)
# Custom domain routing will be added when configured
EOF

# Set permissions for acme.json
touch "${SUPAPANEL_DATA_DIR}/traefik/acme/acme.json"
chmod 600 "${SUPAPANEL_DATA_DIR}/traefik/acme/acme.json"

echo "✓ Traefik configured"

# Create docker-compose.yml for production
echo ""
echo "📄 Creating Docker Compose configuration..."
cat > "${SUPAPANEL_DATA_DIR}/docker-compose.yml" << 'EOF'
name: supapanel

networks:
  supapanel-network:
    driver: bridge
    name: supapanel-network

volumes:
  postgres_data:
  traefik_acme:

services:
  # Traefik Reverse Proxy
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
    environment:
      - TRAEFIK_ACME_EMAIL=${TRAEFIK_ACME_EMAIL}

  # PostgreSQL Database for Panel
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

  # SupaPanel Panel
  panel:
    image: alanmf30/supapanel:${SUPAPANEL_VERSION:-latest}
    container_name: supapanel-panel
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - SUPAPANEL_MODE=production
      - DATABASE_URL=${DATABASE_URL}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL:-http://localhost:3000}
      - DATA_PATH=/data
      - SUPABASE_CORE_REPO_URL=${SUPABASE_CORE_REPO_URL}
      - APP_NAME=${APP_NAME:-SupaPanel}
      - APP_URL=${APP_URL:-http://localhost:3000}
    volumes:
      - ${DATA_PATH}/core:/data/core
      - ${DATA_PATH}/projects:/data/projects
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - supapanel-network
    depends_on:
      postgres:
        condition: service_healthy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.panel.rule=PathPrefix(`/`)"
      - "traefik.http.routers.panel.entrypoints=websecure"
      - "traefik.http.routers.panel.tls.certresolver=letsencrypt"
      - "traefik.http.services.panel.loadbalancer.server.port=3000"
EOF

echo "✓ Docker Compose configuration created"

# Pull latest images
echo ""
echo "📥 Pulling Docker images..."
cd "${SUPAPANEL_DATA_DIR}"
docker compose pull
echo "✓ Docker images pulled"

# Start services
echo ""
echo "🚀 Starting SupaPanel..."
docker compose up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to start..."
sleep 10

# Check if panel is running
if docker ps | grep -q supapanel-panel; then
    echo "✓ SupaPanel panel is running"
else
    echo "⚠️  Warning: Panel container may not be running yet"
fi

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║   🎉 SupaPanel installed successfully!                      ║"
echo "║                                                               ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║                                                               ║"
echo "║   📌 Access your panel:                                       ║"
echo "║      http://${SERVER_IP}:3000                                 ║"
echo "║                                                               ║"
echo "║   📁 Data directory: ${SUPAPANEL_DATA_DIR}                  ║"
echo "║                                                               ║"
echo "║   🔐 Register your first admin account to get started!       ║"
echo "║                                                               ║"
echo "║   📖 To configure a custom domain:                            ║"
echo "║      1. Point your domain to this server's IP                 ║"
echo "║      2. Update TRAEFIK_ACME_EMAIL in ${SUPAPANEL_DATA_DIR}/.env ║"
echo "║      3. Configure the domain in the panel settings            ║"
echo "║                                                               ║"
echo "║   🔧 Useful commands:                                         ║"
echo "║      cd ${SUPAPANEL_DATA_DIR} && docker compose logs -f     ║"
echo "║      cd ${SUPAPANEL_DATA_DIR} && docker compose restart     ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
