FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages ./packages
COPY backend/package.json ./backend/

# Install dependencies (cached npm store)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=backend --include-workspace-root

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

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=backend --include-workspace-root --omit=dev

# Copy built output, Prisma schema, and generated client from build stage
COPY --from=base /app/backend/dist ./backend/dist
COPY --from=base /app/backend/prisma ./backend/prisma
COPY --from=base /app/node_modules/.prisma ./node_modules/.prisma

# Entrypoint script: run migrations + seed, then start
COPY backend/docker-entrypoint.sh ./backend/docker-entrypoint.sh
RUN chmod +x ./backend/docker-entrypoint.sh

EXPOSE 8000

CMD ["./backend/docker-entrypoint.sh"]
