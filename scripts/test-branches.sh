#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
qa_database="supapanel-branches-test-$$"
cleanup() { docker rm -fv "$qa_database" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$qa_database" -e POSTGRES_PASSWORD=branch-integration-only -e POSTGRES_DB=supapanel -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$qa_database" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
qa_port="$(docker port "$qa_database" 5432/tcp)"
export DATABASE_URL="postgresql://postgres:branch-integration-only@127.0.0.1:${qa_port##*:}/supapanel"
export SUPAPANEL_MODE=development PROXY_MODE=standalone BRANCH_WORKER_DISABLED=1
npx prisma db push --skip-generate
BRANCH_INTEGRATION=1 npx tsx --test tests/branches.integration.test.ts
