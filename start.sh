#!/bin/sh
set -e

echo "[start] Starting Iowa Grants app..."
echo "[start] Node version: $(node -v)"

# Check DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "[start] WARNING: DATABASE_URL is not set!"
else
  echo "[start] DATABASE_URL is set (length: ${#DATABASE_URL})"
fi

# Run migrations with timeout (30s) - don't fail if it errors
echo "[start] Running Prisma migrations..."
timeout 30 npx prisma migrate deploy 2>&1 || echo "[start] Migration failed or timed out, continuing anyway..."

# Start the Next.js app
echo "[start] Starting Next.js server..."
exec npm start
