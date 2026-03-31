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

# Run migrations with timeout (30s) - don't fail if it errors
echo "[start] Running Prisma migrations..."
npx prisma migrate deploy 2>&1 || echo "[start] Migration failed, continuing anyway..."

# Start the Next.js app on the correct port
echo "[start] Starting Next.js server on port ${PORT:-3000}..."
exec npx next start -p ${PORT:-3000}
