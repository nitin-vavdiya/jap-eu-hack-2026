FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages ./packages
COPY backend/package.json ./backend/

# Install dependencies
RUN npm ci --workspace=backend --include-workspace-root

# Copy backend source (includes prisma/)
COPY backend ./backend

# Generate Prisma client and build TypeScript
RUN npm run build --workspace=backend

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages ./packages
COPY backend/package.json ./backend/

RUN npm ci --workspace=backend --include-workspace-root --omit=dev

# Copy built output and Prisma schema (for migrations)
COPY --from=base /app/backend/dist ./backend/dist
COPY --from=base /app/backend/prisma ./backend/prisma

# Generate Prisma client in production stage
RUN cd backend && npx prisma generate

# Entrypoint script: run migrations + seed, then start
COPY backend/docker-entrypoint.sh ./backend/docker-entrypoint.sh
RUN chmod +x ./backend/docker-entrypoint.sh

EXPOSE 8000

CMD ["./backend/docker-entrypoint.sh"]
