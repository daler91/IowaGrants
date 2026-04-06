#!/bin/sh

echo "[start] Starting Iowa Grants app..."
echo "[start] Node version: $(node -v)"
echo "[start] PORT: ${PORT:-not set}"

# Check DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "[start] WARNING: DATABASE_URL is not set!"
else
  echo "[start] DATABASE_URL is set (length: ${#DATABASE_URL})"
fi

# Run migrations — if failed migrations block deploy, resolve them and retry
echo "[start] Running Prisma migrations..."
DEPLOY_OUTPUT=$(npx --yes prisma migrate deploy 2>&1)
DEPLOY_EXIT=$?
echo "$DEPLOY_OUTPUT"

if [ $DEPLOY_EXIT -ne 0 ]; then
  # Extract failed migration names from deploy output (backtick-wrapped, ending with "failed")
  FAILED_MIGRATIONS=$(echo "$DEPLOY_OUTPUT" | sed -n 's/.*`\([^`]*\)`.*failed.*/\1/p')

  if [ -n "$FAILED_MIGRATIONS" ]; then
    for migration in $FAILED_MIGRATIONS; do
      echo "[start] Resolving failed migration: $migration"
      npx --yes prisma migrate resolve --rolled-back "$migration" 2>&1
    done

    echo "[start] Retrying migrations after resolving failed ones..."
    npx --yes prisma migrate deploy 2>&1
    if [ $? -ne 0 ]; then
      echo "[start] ERROR: Migration failed after retry. Aborting startup." >&2
      exit 1
    fi
  else
    echo "[start] ERROR: Migration failed (no failed migrations to resolve). Aborting startup." >&2
    exit 1
  fi
fi

# Copy static files for standalone mode
echo "[start] Setting up standalone static files..."
cp -r .next/static .next/standalone/.next/static

# Start the Next.js app on the correct port
echo "[start] Starting Next.js server on port ${PORT:-3000}..."
PORT=${PORT:-3000} HOSTNAME=0.0.0.0 exec node .next/standalone/server.js
