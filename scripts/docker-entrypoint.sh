#!/bin/sh
set -e

# Wait for the database to be ready
# (Optional: we can rely on Docker Compose healthcheck, but a quick check here is good)

echo "Starting SupaPanel..."

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is not set."
  exit 1
fi

# Run database migrations
echo "Running database migrations..."
# We use db push for now to ensure schema is in sync. 
# In a strict production environment with existing data, migrate deploy might be safer,
# but for this self-hosted panel, db push is often preferred to keep it simple.
npx prisma db push --skip-generate

# Execute the main command
echo "Starting application..."
exec "$@"
