FROM node:20-alpine AS build
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/portal-tata-public/package.json ./apps/portal-tata-public/

# Install dependencies
RUN npm ci --workspace=apps/portal-tata-public --include-workspace-root

# Copy app source
COPY apps/portal-tata-public ./apps/portal-tata-public

# Build
RUN npm run build --workspace=apps/portal-tata-public

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/apps/portal-tata-public/dist /usr/share/nginx/html

# Support SPA routing
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
