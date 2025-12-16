# SupaPanel

**Open-source management panel for self-hosted Supabase instances**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org)

SupaPanel is a web-based control panel that simplifies the deployment and management of multiple self-hosted Supabase projects. Deploy your own Supabase infrastructure on any Linux server with a single command.

> **Fork Notice**: This project is based on [sharonpraju/SupaConsole](https://github.com/sharonpraju/SupaConsole). Thanks to [@sharonpraju](https://github.com/sharonpraju) for the original work.

---

## Table of Contents

- [Why SupaPanel?](#why-supapanel)
- [Features](#features)
- [Quick Start](#quick-start)
- [Tech Stack](#tech-stack)
- [Usage Guide](#usage-guide)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

---

## Why SupaPanel?

If you're looking to **self-host Supabase** without the complexity of managing Docker Compose files, Traefik configurations, and SSL certificates manually, SupaPanel provides:

- **Single-command deployment** for production environments
- **Multi-project management** from a unified dashboard
- **Automatic HTTPS** via Traefik and Let's Encrypt
- **Custom domain support** for each Supabase project
- **Team collaboration** with user management

Perfect for agencies, development teams, and organizations that need to manage multiple Supabase instances on their own infrastructure.

---

## Features

| Feature | Description |
|---------|-------------|
| **One-Command Install** | Deploy on any Linux server with a single `curl` command |
| **Docker Integration** | Automated Docker Compose deployment for each project |
| **Traefik Reverse Proxy** | Automatic HTTPS with Let's Encrypt certificates |
| **Secure Registration** | First-user-only admin registration |
| **Environment Config** | Web interface for managing project environment variables |
| **Custom Domains** | Assign unique domains to each Supabase project |
| **Team Management** | User authentication and team member access control |
| **Modern Interface** | Dark theme with responsive design using shadcn/ui |

---

## Quick Start

### Production Deployment

Deploy SupaPanel on any fresh Linux server (Ubuntu 22.04+, Debian 11+):

```bash
curl -sSL https://raw.githubusercontent.com/alanfrigo/SupaPanel/main/install.sh | sh
```

The installation script will:

1. Install Docker if not present
2. Configure Traefik reverse proxy with automatic HTTPS
3. Deploy PostgreSQL database
4. Launch the SupaPanel application
5. Generate secure passwords automatically

After installation, access `http://YOUR_SERVER_IP:3000` to create your admin account.

### Local Development

For local development setup, see the [Testing Guide](docs/TESTING.md).

```bash
# Clone repository
git clone https://github.com/alanfrigo/SupaPanel.git
cd SupaPanel

# Install dependencies
npm install

# Start PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# Configure environment
cp .env.example .env
npm run db:generate
npm run db:push

# Start development server
npm run dev
```

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes, Prisma ORM |
| Database | PostgreSQL |
| Proxy | Traefik v3 with Let's Encrypt |
| Container | Docker, Docker Compose |

---

## Usage Guide

### Initial Setup

1. Access the panel at `http://YOUR_IP:3000`
2. Create your admin account (first user registration only)
3. Click **Initialize** to set up Supabase core files
4. Create your first Supabase project

### Creating Projects

1. Click **New Project** on the dashboard
2. Enter project name and description
3. Configure environment variables
4. Deploy with one click

### Custom Domain Configuration

1. Point your domain DNS A record to the server IP
2. Navigate to project settings > Domain
3. Enter your domain (e.g., `api.example.com`)
4. Traefik automatically provisions SSL certificates

---

## Project Structure

```
supapanel/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   ├── auth/               # Authentication pages
│   │   └── dashboard/          # Dashboard pages
│   ├── components/             # React components
│   └── lib/                    # Utilities (auth, db, project, traefik)
├── prisma/                     # Database schema
├── traefik/                    # Traefik configuration
├── docs/                       # Documentation
│   └── TESTING.md              # Testing guide
├── install.sh                  # Production installation script
└── docker-compose.dev.yml      # Development PostgreSQL
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `NEXTAUTH_SECRET` | Session encryption secret | Auto-generated |
| `NEXTAUTH_URL` | Panel base URL | `http://localhost:3000` |
| `TRAEFIK_ACME_EMAIL` | Let's Encrypt notification email | `admin@example.com` |
| `DATA_PATH` | Data storage directory | `/etc/supapanel` |

---

## Contributing

Contributions are welcome. Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Commit: `git commit -m 'Add your feature'`
5. Push: `git push origin feature/your-feature`
6. Open a Pull Request

See [TESTING.md](docs/TESTING.md) for development setup instructions.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [sharonpraju/SupaConsole](https://github.com/sharonpraju/SupaConsole) — Original project
- [Supabase](https://supabase.com) — The open-source Firebase alternative
- [Traefik](https://traefik.io) — Cloud-native reverse proxy
