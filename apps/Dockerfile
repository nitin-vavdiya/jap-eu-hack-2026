ARG APP_NAME

FROM node:20-alpine AS build
ARG APP_NAME
WORKDIR /app

# Copy root workspace config + only required package.jsons
COPY package.json package-lock.json ./
COPY packages/auth/package.json ./packages/auth/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/ui-tokens/package.json ./packages/ui-tokens/
COPY apps/${APP_NAME}/package.json ./apps/${APP_NAME}/

# Install only target app + shared package dependencies (cached npm store)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=apps/${APP_NAME} \
           --workspace=packages/auth \
           --workspace=packages/shared-types \
           --workspace=packages/ui-tokens \
           --include-workspace-root

# Copy shared workspace packages (source needed at build time)
COPY packages ./packages

# Copy target app source
COPY apps/${APP_NAME} ./apps/${APP_NAME}

# Build
RUN npm run build --workspace=apps/${APP_NAME}

# Serve with nginx
FROM nginx:alpine
ARG APP_NAME
COPY --from=build /app/apps/${APP_NAME}/dist /usr/share/nginx/html

# Support SPA routing
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

# Runtime config entrypoint
COPY apps/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
CMD ["/docker-entrypoint.sh"]
