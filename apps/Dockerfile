ARG APP_NAME

FROM node:20-alpine AS build
ARG APP_NAME
WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json ./

# Copy all workspace package.jsons (npm ci needs all workspaces present)
COPY packages/auth/package.json ./packages/auth/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/ui-tokens/package.json ./packages/ui-tokens/
COPY apps/portal-dataspace/package.json ./apps/portal-dataspace/
COPY apps/portal-tata-admin/package.json ./apps/portal-tata-admin/
COPY apps/portal-tata-public/package.json ./apps/portal-tata-public/
COPY apps/portal-wallet/package.json ./apps/portal-wallet/
COPY apps/portal-insurance/package.json ./apps/portal-insurance/
COPY apps/portal-company/package.json ./apps/portal-company/
COPY backend/package.json ./backend/

# Install all dependencies
RUN npm ci

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

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
