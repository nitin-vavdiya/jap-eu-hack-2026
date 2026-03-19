FROM node:20-alpine AS build
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/portal-company/package.json ./apps/portal-company/

# Install dependencies
RUN npm ci --workspace=apps/portal-company --include-workspace-root

# Copy app source
COPY apps/portal-company ./apps/portal-company

# Build
RUN npm run build --workspace=apps/portal-company

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/apps/portal-company/dist /usr/share/nginx/html

# Support SPA routing
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
