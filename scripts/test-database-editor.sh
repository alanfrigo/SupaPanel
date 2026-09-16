#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
qa_directory="$(mktemp -d "${TMPDIR:-/tmp}/supapanel-editor.XXXXXX")"
qa_run="supapanel-editor-$$"
cleanup() {
  for suffix in a b; do
    if [ -f "$qa_directory/projects/editor-qa-$suffix/docker/compose.yml" ]; then
      docker compose -f "$qa_directory/projects/editor-qa-$suffix/docker/compose.yml" down --volumes >/dev/null 2>&1 || true
    fi
  done
  rm -rf "$qa_directory"
}
trap cleanup EXIT
for suffix in a b; do
  qa_stack="$qa_directory/projects/editor-qa-$suffix/docker"
  mkdir -p "$qa_stack"
  cp tests/fixtures/database-compose.yml "$qa_stack/compose.yml"
  printf 'COMPOSE_PROJECT_NAME=%s-%s\n' "$qa_run" "$suffix" > "$qa_stack/.env"
  docker compose -f "$qa_stack/compose.yml" up -d --wait
 done
SUPAPANEL_MODE=production DATA_PATH="$qa_directory" DATABASE_EDITOR_INTEGRATION=1 npx tsx --test tests/database.integration.test.ts
