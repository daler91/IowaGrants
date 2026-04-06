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

# Resolve any previously failed migrations so migrate deploy can retry them
echo "[start] Checking for failed migrations..."
FAILED_MIGRATIONS=$(npx --yes prisma migrate status 2>&1 | grep -oP '`\K[^`]+(?=`.*failed)')
if [ -n "$FAILED_MIGRATIONS" ]; then
  for migration in $FAILED_MIGRATIONS; do
    echo "[start] Resolving failed migration: $migration"
    npx --yes prisma migrate resolve --rolled-back "$migration" 2>&1
  done
fi

# Run migrations - fail fast if migrations fail to prevent inconsistent state
echo "[start] Running Prisma migrations..."
npx --yes prisma migrate deploy 2>&1
if [ $? -ne 0 ]; then
  echo "[start] ERROR: Migration failed. Aborting startup." >&2
  exit 1
fi

# Copy static files for standalone mode
echo "[start] Setting up standalone static files..."
cp -r .next/static .next/standalone/.next/static

# Start the Next.js app on the correct port
echo "[start] Starting Next.js server on port ${PORT:-3000}..."
PORT=${PORT:-3000} HOSTNAME=0.0.0.0 exec node .next/standalone/server.js
