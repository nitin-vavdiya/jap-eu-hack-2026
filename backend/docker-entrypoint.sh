#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/backend
npx prisma migrate deploy

echo "Running database seed..."
npx prisma db seed || echo "Seed skipped or already applied"

echo "Starting backend..."
cd /app
exec node backend/dist/index.js
